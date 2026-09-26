"""Audit-log and status-history helpers. Every important event goes through here."""
import logging

from sqlalchemy.orm import Session

from .models import AuditLog, Candidate, CandidateStatusHistory, User

log = logging.getLogger("smarthire.audit")


class Event:
    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    JD_CREATED = "JD_CREATED"
    JD_UPDATED = "JD_UPDATED"
    JD_DELETED = "JD_DELETED"
    SCREENING_RUN = "SCREENING_RUN"
    RESUME_SCORED = "RESUME_SCORED"
    RESUME_SCORE_FAILED = "RESUME_SCORE_FAILED"
    CANDIDATE_PROMOTED = "CANDIDATE_PROMOTED"
    CANDIDATE_FILTERED = "CANDIDATE_FILTERED"
    INVITATION_SENT = "INVITATION_SENT"
    QA_STARTED = "QA_STARTED"
    ANSWER_SUBMITTED = "ANSWER_SUBMITTED"
    ANSWER_SCORED = "ANSWER_SCORED"
    ANSWER_SCORE_FAILED = "ANSWER_SCORE_FAILED"
    QA_COMPLETED = "QA_COMPLETED"
    COMBINED_SCORED = "COMBINED_SCORED"
    INTERVIEW_ASSIGNED = "INTERVIEW_ASSIGNED"
    INTERVIEWER_CHANGED = "INTERVIEWER_CHANGED"
    INTERVIEW_DATE_UPDATED = "INTERVIEW_DATE_UPDATED"
    INTERVIEW_DECISION = "INTERVIEW_DECISION"
    STATUS_CHANGED = "STATUS_CHANGED"
    FINAL_DECISION = "FINAL_DECISION"
    NOTE_ADDED = "NOTE_ADDED"
    NEXT_STEP_ADDED = "NEXT_STEP_ADDED"


def record(
    db: Session,
    event_type: str,
    actor: User | None = None,
    candidate_id: str | None = None,
    jd_id: str | None = None,
    **meta,
) -> AuditLog:
    entry = AuditLog(
        event_type=event_type,
        actor_id=actor.id if actor else None,
        actor_username=actor.username if actor else "system",
        actor_role=actor.role if actor else "system",
        candidate_id=candidate_id,
        jd_id=jd_id,
        meta=meta,
    )
    db.add(entry)
    log.info("audit %s actor=%s candidate=%s %s", event_type, entry.actor_username, candidate_id, meta)
    return entry


def change_status(
    db: Session, candidate: Candidate, new_status: str, reason: str | None, actor: User | None
) -> None:
    old = candidate.status
    if old == new_status and candidate.status_reason == reason:
        return
    candidate.status = new_status
    candidate.status_reason = reason
    db.add(
        CandidateStatusHistory(
            candidate_id=candidate.id,
            from_status=old,
            to_status=new_status,
            reason=reason,
            actor_id=actor.id if actor else None,
            actor_username=actor.username if actor else "system",
        )
    )
    record(db, Event.STATUS_CHANGED, actor, candidate.id, candidate.jd_id,
           from_status=old, to_status=new_status, reason=reason)
