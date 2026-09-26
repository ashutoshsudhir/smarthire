"""Business logic for resume screening, answer scoring and the combined decision.

AI calls go through ``llm_client.call`` only; this module owns thresholds, weights,
status transitions and persistence.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .. import llm_client
from ..audit import Event, change_status, record
from ..models import (
    Answer,
    AnswerScore,
    Candidate,
    JobDescription,
    ResumeScore,
    ScreeningAttempt,
    Status,
    User,
)
from ..prompts import AnswerScoreOutput, ResumeMatchOutput, answer_score_prompt, resume_match_prompt
from . import heuristics

log = logging.getLogger("smarthire.scoring")

DISAGREEMENT_GAP = 30  # resume vs Q&A points (0-100) considered a strong disagreement
BAND_TO_STATUS = {"PASS": Status.PASSED, "HOLD": Status.HOLD, "REJECT": Status.REJECTED}


def jd_dict(jd: JobDescription) -> dict:
    return {
        "id": jd.id, "title": jd.title, "summary": jd.summary, "must_have": jd.must_have,
        "nice_to_have": jd.nice_to_have, "experience_years": jd.experience_years,
        "education": jd.education, "location": jd.location, "pass_threshold": jd.pass_threshold,
    }


# ----------------------------------------------------------------------------- resume

def _score_resume(jd: dict, cand: dict) -> tuple[str, llm_client.LLMResult | None, str | None]:
    prompt = resume_match_prompt(jd, cand["resume"], cand)
    try:
        res = llm_client.call(
            prompt,
            ResumeMatchOutput,
            mock=lambda: heuristics.resume_match(jd, cand["resume"], cand["experience_years"]),
        )
        return cand["id"], res, None
    except llm_client.LLMError as e:
        return cand["id"], None, str(e)


def screen_jd(db: Session, jd: JobDescription, actor: User | None, force: bool = False) -> dict:
    """Score every not-yet-screened resume for the JD and promote / filter by threshold."""
    q = db.query(Candidate).filter(Candidate.jd_id == jd.id)
    if force:
        # Re-screen anyone who has not started Q&A yet.
        started = {a.candidate_id for a in db.query(ScreeningAttempt.candidate_id).filter(ScreeningAttempt.jd_id == jd.id)}
        candidates = [c for c in q if c.status in (Status.APPLIED, Status.FILTERED, Status.SCREENING)
                      and c.id not in started]
    else:
        candidates = q.filter(Candidate.status == Status.APPLIED).all()

    jdd = jd_dict(jd)
    payloads = [
        {"id": c.id, "resume": c.resume_text, "experience_years": c.experience_years,
         "education": c.education, "location": c.location}
        for c in candidates
    ]
    # Independent single-turn calls run concurrently; persistence stays on this thread.
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda p: _score_resume(jdd, p), payloads))

    summary = {"jd_id": jd.id, "screened": 0, "promoted": [], "filtered": [], "errors": []}
    by_id = {c.id: c for c in candidates}
    for cand_id, res, err in results:
        cand = by_id[cand_id]
        if err or res is None:
            summary["errors"].append({"candidate_id": cand_id, "error": err})
            record(db, Event.RESUME_SCORE_FAILED, actor, cand_id, jd.id, error=err)
            continue
        out: ResumeMatchOutput = res.data  # type: ignore[assignment]
        passed = out.score >= jd.pass_threshold
        db.query(ResumeScore).filter(ResumeScore.candidate_id == cand_id).update({"is_current": False})
        db.add(ResumeScore(
            candidate_id=cand_id, jd_id=jd.id, score=round(out.score, 1), matched_skills=out.matched_skills,
            gaps=out.gaps, summary=out.summary, confidence=round(out.confidence, 2),
            threshold_used=jd.pass_threshold, passed=passed, provider=res.provider, model=res.model,
            latency_ms=res.latency_ms,
        ))
        cand.resume_score = round(out.score, 1)
        cand.resume_confidence = round(out.confidence, 2)
        record(db, Event.RESUME_SCORED, actor, cand_id, jd.id, score=cand.resume_score,
               confidence=cand.resume_confidence, threshold=jd.pass_threshold,
               provider=res.provider, model=res.model, attempts=res.attempts, latency_ms=res.latency_ms)
        if passed:
            reason = f"Resume score {cand.resume_score} >= threshold {jd.pass_threshold}"
            change_status(db, cand, Status.SCREENING, reason, actor)
            record(db, Event.CANDIDATE_PROMOTED, actor, cand_id, jd.id, reason=reason)
            # Invitation is stubbed: in-app notice + logged event, no real email.
            record(db, Event.INVITATION_SENT, actor, cand_id, jd.id, channel="in-app (stub)",
                   message="You have been invited to the screening Q&A round.")
            log.info("[stub invite] candidate %s invited to Q&A for %s", cand_id, jd.id)
            summary["promoted"].append(cand_id)
        else:
            reason = (f"Archived: resume score {cand.resume_score} below threshold {jd.pass_threshold}. "
                      f"Gaps: {', '.join(out.gaps[:4]) or 'n/a'}")
            change_status(db, cand, Status.FILTERED, reason, actor)
            record(db, Event.CANDIDATE_FILTERED, actor, cand_id, jd.id, reason=reason)
            summary["filtered"].append(cand_id)
        refresh_flags(db, cand)
        summary["screened"] += 1

    jd.last_screened_at = datetime.now(timezone.utc)
    record(db, Event.SCREENING_RUN, actor, None, jd.id, screened=summary["screened"],
           promoted=len(summary["promoted"]), filtered=len(summary["filtered"]),
           errors=len(summary["errors"]), force=force)
    db.commit()
    return summary


# ----------------------------------------------------------------------------- answers

def score_answer(db: Session, answer: Answer, actor: User | None) -> AnswerScore | None:
    """Score one answer with the answer_score prompt. Idempotent: never rescored once stored."""
    if answer.score is not None:
        return answer.score
    q = answer.question
    prompt = answer_score_prompt(q.text, q.reference_answer, q.rubric, answer.answer_text)
    try:
        res = llm_client.call(
            prompt,
            AnswerScoreOutput,
            mock=lambda: heuristics.answer_score(q.text, q.reference_answer, q.rubric, answer.answer_text),
        )
    except llm_client.LLMError as e:
        answer.score_status = "FAILED"
        answer.score_error = str(e)
        record(db, Event.ANSWER_SCORE_FAILED, actor, answer.candidate_id, None,
               answer_id=answer.id, question_id=answer.question_id, error=str(e))
        return None
    out: AnswerScoreOutput = res.data  # type: ignore[assignment]
    sc = AnswerScore(
        answer_id=answer.id, score=out.score, justification=out.justification,
        confidence=round(out.confidence, 2), rubric_hits=out.rubric_hits,
        provider=res.provider, model=res.model, latency_ms=res.latency_ms,
    )
    db.add(sc)
    answer.score = sc
    answer.score_status = "SCORED"
    answer.score_error = None
    record(db, Event.ANSWER_SCORED, actor, answer.candidate_id, None, answer_id=answer.id,
           question_id=answer.question_id, score=out.score, confidence=sc.confidence,
           provider=res.provider, attempts=res.attempts, latency_ms=res.latency_ms)
    return sc


def compute_band(combined: float, avg_conf: float | None, jd: JobDescription) -> tuple[str, str]:
    if combined >= jd.pass_threshold:
        if avg_conf is not None and avg_conf < jd.confidence_cutoff:
            return "HOLD", (f"Combined {combined} meets threshold {jd.pass_threshold}, but average AI "
                            f"confidence {avg_conf} < cutoff {jd.confidence_cutoff}: human review needed")
        return "PASS", f"Combined {combined} >= pass threshold {jd.pass_threshold}"
    if combined >= jd.pass_threshold - jd.hold_margin:
        return "HOLD", (f"Combined {combined} within {jd.hold_margin} points below threshold "
                        f"{jd.pass_threshold}")
    return "REJECT", f"Combined {combined} below hold band ({jd.pass_threshold - jd.hold_margin})"


def combined_score(resume_score: float, qa_normalized: float, jd: JobDescription) -> float:
    return round(resume_score * jd.resume_weight + qa_normalized * jd.qa_weight, 1)


def finalize_attempt(db: Session, attempt: ScreeningAttempt, actor: User | None) -> bool:
    """Compute Q&A + combined score and band once every answer is scored. Returns True if done."""
    answers = attempt.answers
    if len(answers) < len(attempt.question_ids) or any(a.score is None for a in answers):
        return False
    if attempt.band is not None:
        return True
    cand = db.get(Candidate, attempt.candidate_id)
    jd = db.get(JobDescription, attempt.jd_id)
    total = sum(a.score.score for a in answers)
    max_total = 5 * len(attempt.question_ids)
    qa_norm = round(total / max_total * 100, 1) if max_total else 0.0
    resume = cand.resume_score or 0.0
    combined = combined_score(resume, qa_norm, jd)
    confs = [a.score.confidence for a in answers]
    if cand.resume_confidence is not None:
        confs.append(cand.resume_confidence)
    avg_conf = round(sum(confs) / len(confs), 2) if confs else None
    band, reason = compute_band(combined, avg_conf, jd)

    attempt.qa_total, attempt.qa_max, attempt.qa_normalized = total, max_total, qa_norm
    attempt.combined_score, attempt.band, attempt.avg_confidence = combined, band, avg_conf
    cand.qa_score, cand.combined_score, cand.band, cand.avg_confidence = qa_norm, combined, band, avg_conf
    refresh_flags(db, cand)
    record(db, Event.COMBINED_SCORED, actor, cand.id, jd.id, resume_score=resume, qa_total=total,
           qa_max=max_total, qa_normalized=qa_norm, resume_weight=jd.resume_weight,
           qa_weight=jd.qa_weight, combined=combined, band=band, avg_confidence=avg_conf,
           flags=cand.flags)
    change_status(db, cand, BAND_TO_STATUS[band], reason, actor)
    return True


def refresh_flags(db: Session, cand: Candidate) -> None:
    """Human-in-the-loop flags. Informational only: never used to auto-reject."""
    jd = cand.jd or db.get(JobDescription, cand.jd_id)
    flags: list[dict] = []
    if cand.resume_confidence is not None and cand.resume_confidence < jd.confidence_cutoff:
        flags.append({"code": "LOW_RESUME_CONFIDENCE",
                      "message": f"Resume match confidence {cand.resume_confidence} < {jd.confidence_cutoff}"})
    if cand.avg_confidence is not None and cand.avg_confidence < jd.confidence_cutoff:
        flags.append({"code": "LOW_CONFIDENCE",
                      "message": f"Average AI confidence {cand.avg_confidence} < {jd.confidence_cutoff}"})
    if cand.resume_score is not None and cand.qa_score is not None:
        gap = abs(cand.resume_score - cand.qa_score)
        if gap >= DISAGREEMENT_GAP:
            flags.append({"code": "SCORE_DISAGREEMENT",
                          "message": f"Resume ({cand.resume_score}) and Q&A ({cand.qa_score}) differ by {round(gap, 1)} points"})
    answers = db.query(Answer).filter(Answer.candidate_id == cand.id).all()
    tabs = sum(a.tab_switches for a in answers)
    pastes = sum(a.paste_count for a in answers)
    copies = sum(a.copy_count for a in answers)
    if tabs >= 3 or pastes >= 1 or copies >= 1:
        flags.append({"code": "ANTI_CHEAT",
                      "message": f"Tab switches {tabs}, paste events {pastes}, copy-question events {copies}"})
    if any(a.score_status == "FAILED" for a in answers):
        flags.append({"code": "SCORING_FAILED", "message": "One or more answers could not be scored"})
    cand.flags = flags
