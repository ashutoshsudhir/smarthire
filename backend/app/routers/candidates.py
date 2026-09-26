from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..audit import Event, change_status, record
from ..database import get_db
from ..deps import active_interview, current_user, ensure_can_view_candidate, get_candidate_or_404, require_admin
from ..models import Candidate, Interview, InterviewerNote, NextStep, Role, Status, User, utcnow
from ..schemas import FinalDecision, NextStepCreate, NoteCreate, PromoteRequest, StatusUpdate
from ..services.scoring import refresh_flags
from ..views import candidate_detail, candidate_result_view, candidate_row, candidate_self_view

router = APIRouter(tags=["candidates"])

SORTABLE = {"name", "resume_score", "qa_score", "combined_score", "avg_confidence", "status", "applied_at",
            "interview_date"}


@router.get("/candidates")
def list_candidates(
    jd_id: str | None = None,
    status_: str | None = Query(default=None, alias="status"),
    band: str | None = None,
    q: str | None = None,
    min_confidence: float | None = None,
    flagged: bool | None = None,
    sort: str = "combined_score",
    order: str = "desc",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role == Role.CANDIDATE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Candidates can only view their own application")
    query = db.query(Candidate)
    if user.role == Role.INTERVIEWER:
        assigned = {cid for (cid,) in db.query(Interview.candidate_id).filter(
            Interview.interviewer_id == user.id, Interview.status != "CANCELLED")}
        query = query.filter(Candidate.id.in_(assigned or {"-"}))
    if jd_id:
        query = query.filter(Candidate.jd_id == jd_id)
    if status_:
        query = query.filter(Candidate.status.in_(status_.split(",")))
    if band:
        query = query.filter(Candidate.band == band)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter((Candidate.name.ilike(like)) | (Candidate.email.ilike(like)) | (Candidate.id.ilike(like)))
    if min_confidence is not None:
        query = query.filter(Candidate.avg_confidence >= min_confidence)
    rows = [candidate_row(db, c) for c in query.all()]
    if flagged is not None:
        rows = [r for r in rows if bool(r["flags"]) == flagged]
    if sort not in SORTABLE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"sort must be one of {sorted(SORTABLE)}")
    present = [r for r in rows if r.get(sort) is not None]
    missing = [r for r in rows if r.get(sort) is None]
    present.sort(key=lambda r: r[sort], reverse=(order == "desc"))
    rows = present + missing
    return {"total": len(rows), "items": rows[offset: offset + limit], "limit": limit, "offset": offset}


@router.get("/me/application")
def my_application(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != Role.CANDIDATE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only candidates have an application")
    cand = db.query(Candidate).filter(Candidate.user_id == user.id).first()
    if cand is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No application found for this account")
    return candidate_self_view(db, cand)


@router.get("/candidates/{candidate_id}")
def get_candidate(candidate_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cand = get_candidate_or_404(db, candidate_id)
    ensure_can_view_candidate(db, user, cand)
    if user.role == Role.CANDIDATE:
        return candidate_self_view(db, cand)
    return candidate_detail(db, cand, user)


@router.get("/candidates/{candidate_id}/result")
def get_result(candidate_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cand = get_candidate_or_404(db, candidate_id)
    ensure_can_view_candidate(db, user, cand)
    if user.role == Role.CANDIDATE:
        return candidate_result_view(db, cand)
    d = candidate_detail(db, cand, user)
    return {"attempt": d["attempt"], "answers": d["answers"], "resume_score": cand.resume_score,
            "qa_score": cand.qa_score, "combined_score": cand.combined_score, "band": cand.band,
            "avg_confidence": cand.avg_confidence, "flags": cand.flags}


@router.post("/candidates/{candidate_id}/promote")
def promote(candidate_id: str, body: PromoteRequest | None = None, db: Session = Depends(get_db),
            admin: User = Depends(require_admin)):
    """Manual human override: move a candidate into the Screening (Q&A) round."""
    cand = get_candidate_or_404(db, candidate_id)
    if cand.status not in (Status.APPLIED, Status.FILTERED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot promote a candidate in status {cand.status}")
    reason = (body.reason if body and body.reason else "Manually promoted by hiring manager")
    change_status(db, cand, Status.SCREENING, reason, admin)
    record(db, Event.CANDIDATE_PROMOTED, admin, cand.id, cand.jd_id, reason=reason, manual=True)
    record(db, Event.INVITATION_SENT, admin, cand.id, cand.jd_id, channel="in-app (stub)")
    db.commit()
    return candidate_row(db, cand)


@router.post("/candidates/{candidate_id}/status")
def update_status(candidate_id: str, body: StatusUpdate, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    cand = get_candidate_or_404(db, candidate_id)
    if user.role == Role.CANDIDATE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Candidates cannot change application status")
    if body.status not in Status.ALL:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown status {body.status}")
    iv = active_interview(db, cand.id)
    if user.role == Role.INTERVIEWER:
        ensure_can_view_candidate(db, user, cand)
        if body.status not in Status.INTERVIEWER_DECISIONS:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "Interviewers can only set Accepted, Rejected, On-Hold or No-Show")
        if cand.final_decision:
            raise HTTPException(status.HTTP_409_CONFLICT, "Final decision already made by the hiring manager")
    if body.status == Status.HIRED:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Use the final-decision endpoint to hire")
    if iv and body.status in Status.INTERVIEWER_DECISIONS and user.role == Role.INTERVIEWER:
        iv.decision = body.status
        iv.decided_at = utcnow()
        iv.status = "COMPLETED"
        record(db, Event.INTERVIEW_DECISION, user, cand.id, cand.jd_id, interview_id=iv.id,
               decision=body.status, reason=body.reason)
    reason = body.reason or f"Status set by {user.role} {user.username}"
    change_status(db, cand, body.status, reason, user)
    db.commit()
    return candidate_row(db, cand)


@router.post("/candidates/{candidate_id}/final-decision")
def final_decision(candidate_id: str, body: FinalDecision, db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)):
    """Only the hiring manager makes the final hiring decision (AI + interviewer are evidence)."""
    cand = get_candidate_or_404(db, candidate_id)
    cand.final_decision = body.decision
    new_status = Status.HIRED if body.decision == "HIRED" else Status.REJECTED
    reason = body.reason or f"Final decision: {body.decision}"
    change_status(db, cand, new_status, reason, admin)
    record(db, Event.FINAL_DECISION, admin, cand.id, cand.jd_id, decision=body.decision, reason=body.reason)
    db.commit()
    return candidate_row(db, cand)


@router.post("/candidates/{candidate_id}/notes", status_code=201)
def add_note(candidate_id: str, body: NoteCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    cand = get_candidate_or_404(db, candidate_id)
    if user.role == Role.CANDIDATE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Candidates cannot add notes")
    ensure_can_view_candidate(db, user, cand)
    iv = active_interview(db, cand.id)
    note = InterviewerNote(candidate_id=cand.id, interview_id=iv.id if iv else None, author_id=user.id,
                           body=body.body.strip())
    db.add(note)
    record(db, Event.NOTE_ADDED, user, cand.id, cand.jd_id, note=body.body.strip()[:500])
    db.commit()
    return {"id": note.id, "body": note.body, "created_at": note.created_at.isoformat(),
            "author": {"id": user.id, "username": user.username, "display_name": user.display_name},
            "author_role": user.role}


@router.post("/candidates/{candidate_id}/next-steps", status_code=201)
def add_next_step(candidate_id: str, body: NextStepCreate, db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)):
    cand = get_candidate_or_404(db, candidate_id)
    step = NextStep(candidate_id=cand.id, description=body.description.strip(), created_by=admin.id)
    db.add(step)
    record(db, Event.NEXT_STEP_ADDED, admin, cand.id, cand.jd_id, next_step=step.description)
    db.commit()
    return {"id": step.id, "description": step.description, "created_at": step.created_at.isoformat()}


@router.post("/candidates/{candidate_id}/refresh-flags")
def recompute_flags(candidate_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    cand = get_candidate_or_404(db, candidate_id)
    refresh_flags(db, cand)
    db.commit()
    return {"flags": cand.flags}
