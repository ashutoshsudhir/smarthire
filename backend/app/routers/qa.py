"""Candidate screening Q&A: one question at a time, server-tracked timer, per-answer AI scoring."""
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import Event, record
from ..database import get_db
from ..deps import current_user, ensure_can_view_candidate, get_candidate_or_404, require_admin
from ..models import Answer, Candidate, JobDescription, Role, ScreeningAttempt, Status, User, utcnow
from ..schemas import AnswerSubmit
from ..services.scoring import finalize_attempt, refresh_flags, score_answer
from ..views import candidate_result_view

router = APIRouter(tags=["screening q&a"])

GRACE_SEC = 15  # network / auto-submit slack on the server-side timer


def _own_candidate(db: Session, user: User, candidate_id: str) -> Candidate:
    cand = get_candidate_or_404(db, candidate_id)
    if user.role != Role.CANDIDATE or cand.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    return cand


def _attempt(db: Session, cand_id: str) -> ScreeningAttempt | None:
    return (db.query(ScreeningAttempt).filter(ScreeningAttempt.candidate_id == cand_id)
            .order_by(ScreeningAttempt.id.desc()).first())


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _current_question_payload(db: Session, attempt: ScreeningAttempt, jd: JobDescription) -> dict:
    if attempt.status == "COMPLETED" or attempt.current_index >= len(attempt.question_ids):
        return {"completed": True, "index": len(attempt.question_ids), "total": len(attempt.question_ids)}
    qid = attempt.question_ids[attempt.current_index]
    q = next(q for q in jd.questions if q.id == qid)
    if attempt.current_question_started_at is None:
        attempt.current_question_started_at = utcnow()
        db.commit()
    elapsed = (utcnow() - _aware(attempt.current_question_started_at)).total_seconds()
    return {
        "completed": False,
        "attempt_id": attempt.id,
        "index": attempt.current_index + 1,
        "total": len(attempt.question_ids),
        "question": {"id": q.id, "text": q.text},  # never the reference answer / rubric
        "time_limit_sec": jd.question_time_limit_sec,
        "remaining_sec": max(0, int(jd.question_time_limit_sec - elapsed)),
        "started_at": attempt.current_question_started_at.isoformat(),
    }


@router.post("/candidates/{candidate_id}/screening/start")
def start_screening(candidate_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cand = _own_candidate(db, user, candidate_id)
    attempt = _attempt(db, cand.id)
    if attempt is None:
        if cand.status != Status.SCREENING:
            raise HTTPException(status.HTTP_409_CONFLICT, "You are not currently invited to the screening round")
        jd = db.get(JobDescription, cand.jd_id)
        if not jd.questions:
            raise HTTPException(status.HTTP_409_CONFLICT, "No screening questions configured for this job")
        attempt = ScreeningAttempt(candidate_id=cand.id, jd_id=jd.id, question_ids=[q.id for q in jd.questions])
        db.add(attempt)
        record(db, Event.QA_STARTED, user, cand.id, jd.id, questions=len(attempt.question_ids))
        db.commit()
    return _current_question_payload(db, attempt, db.get(JobDescription, cand.jd_id))


@router.get("/candidates/{candidate_id}/questions")
def get_questions(candidate_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Candidate: only the current question (one at a time). Admin: the full question bank + rubric."""
    cand = get_candidate_or_404(db, candidate_id)
    ensure_can_view_candidate(db, user, cand)
    jd = db.get(JobDescription, cand.jd_id)
    if user.role == Role.CANDIDATE:
        attempt = _attempt(db, cand.id)
        if attempt is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Screening has not been started")
        return _current_question_payload(db, attempt, jd)
    return [{"id": q.id, "text": q.text,
             **({"reference_answer": q.reference_answer, "rubric": q.rubric} if user.role == Role.ADMIN else {})}
            for q in jd.questions]


@router.post("/candidates/{candidate_id}/answers", status_code=201)
def submit_answer(candidate_id: str, body: AnswerSubmit, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    cand = _own_candidate(db, user, candidate_id)
    attempt = _attempt(db, cand.id)
    if attempt is None or attempt.status != "IN_PROGRESS":
        raise HTTPException(status.HTTP_409_CONFLICT, "No screening in progress")
    if attempt.current_index >= len(attempt.question_ids):
        raise HTTPException(status.HTTP_409_CONFLICT, "All questions already answered")
    expected = attempt.question_ids[attempt.current_index]
    if body.question_id != expected:
        raise HTTPException(status.HTTP_409_CONFLICT, "Answer must be for the current question")

    jd = db.get(JobDescription, cand.jd_id)
    started = _aware(attempt.current_question_started_at) or utcnow()
    server_elapsed = int((utcnow() - started).total_seconds())
    late = server_elapsed > jd.question_time_limit_sec + GRACE_SEC
    answer = Answer(
        attempt_id=attempt.id, candidate_id=cand.id, question_id=expected,
        answer_text=body.answer_text.strip(), time_taken_sec=min(server_elapsed, jd.question_time_limit_sec + GRACE_SEC),
        time_limit_sec=jd.question_time_limit_sec, auto_submitted=body.auto_submitted or late,
        tab_switches=body.telemetry.tab_switches, paste_count=body.telemetry.paste_count,
        copy_count=body.telemetry.copy_count,
    )
    db.add(answer)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This question was already answered")
    record(db, Event.ANSWER_SUBMITTED, user, cand.id, jd.id, answer_id=answer.id, question_id=expected,
           time_taken_sec=answer.time_taken_sec, auto_submitted=answer.auto_submitted, late=late,
           telemetry=body.telemetry.model_dump(), length=len(answer.answer_text))

    score_answer(db, answer, None)  # one answer_score LLM call; persisted, never re-run

    attempt.current_index += 1
    attempt.current_question_started_at = None
    done = attempt.current_index >= len(attempt.question_ids)
    if done:
        attempt.status = "COMPLETED"
        attempt.completed_at = utcnow()
        record(db, Event.QA_COMPLETED, user, cand.id, jd.id, attempt_id=attempt.id)
        db.flush()
        db.refresh(attempt)
        finalize_attempt(db, attempt, None)
    refresh_flags(db, cand)
    db.commit()
    if done:
        return {"completed": True, "result": candidate_result_view(db, cand)}
    return {"completed": False, "next": _current_question_payload(db, attempt, jd)}


@router.post("/answers/{answer_id}/score")
def rescore_answer(answer_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Retry scoring for an answer whose earlier LLM call failed (stored scores are never recomputed)."""
    answer = db.get(Answer, answer_id)
    if answer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Answer not found")
    if answer.score is not None:
        return {"answer_id": answer.id, "score": answer.score.score, "already_scored": True}
    sc = score_answer(db, answer, admin)
    if sc is None:
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Scoring failed: {answer.score_error}")
    db.flush()
    attempt = db.get(ScreeningAttempt, answer.attempt_id)
    db.refresh(attempt)
    if attempt.status == "COMPLETED":
        finalize_attempt(db, attempt, admin)
    refresh_flags(db, db.get(Candidate, answer.candidate_id))
    db.commit()
    return {"answer_id": answer.id, "score": sc.score, "confidence": sc.confidence}
