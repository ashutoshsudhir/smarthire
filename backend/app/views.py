"""Role-aware serialization. Candidates never receive AI evidence, prompts or notes."""
from sqlalchemy.orm import Session

from .deps import active_interview
from .models import (
    Answer,
    AuditLog,
    Candidate,
    CandidateStatusHistory,
    Interview,
    InterviewerNote,
    JobDescription,
    NextStep,
    ResumeScore,
    ScreeningAttempt,
    Status,
    User,
)

STATUS_LABELS = {
    Status.APPLIED: "Applied",
    Status.FILTERED: "Filtered",
    Status.SCREENING: "Screening",
    Status.PASSED: "Passed",
    Status.HOLD: "Hold",
    Status.REJECTED: "Rejected",
    Status.INTERVIEW_SCHEDULED: "Interview Scheduled",
    Status.ACCEPTED: "Accepted",
    Status.ON_HOLD: "On Hold",
    Status.NO_SHOW: "No-Show",
    Status.HIRED: "Hired",
}

PIPELINE_STAGES = ["Applied", "Resume Screened", "Screening", "Q&A Completed", "Interview", "Final Decision"]


def pipeline_stage(c: Candidate) -> str:
    if c.final_decision:
        return "Final Decision"
    if c.status in (Status.INTERVIEW_SCHEDULED, Status.ACCEPTED, Status.ON_HOLD, Status.NO_SHOW):
        return "Interview"
    if c.band is not None:
        return "Q&A Completed"
    if c.status == Status.SCREENING:
        return "Screening"
    if c.status == Status.FILTERED:
        return "Resume Screened"
    return "Applied"


def iso(dt):
    return dt.isoformat() if dt else None


def user_brief(u: User | None) -> dict | None:
    if u is None:
        return None
    return {"id": u.id, "username": u.username, "display_name": u.display_name, "email": u.email}


def interview_dict(iv: Interview | None) -> dict | None:
    if iv is None:
        return None
    return {
        "id": iv.id, "candidate_id": iv.candidate_id, "interviewer": user_brief(iv.interviewer),
        "scheduled_at": iso(iv.scheduled_at), "status": iv.status, "decision": iv.decision,
        "decided_at": iso(iv.decided_at), "updated_at": iso(iv.updated_at),
    }


def candidate_row(db: Session, c: Candidate, iv: Interview | None = None) -> dict:
    """Admin table row."""
    iv = iv if iv is not None else active_interview(db, c.id)
    return {
        "id": c.id, "name": c.name, "email": c.email, "jd_id": c.jd_id, "jd_title": c.jd.title,
        "status": c.status, "status_label": STATUS_LABELS.get(c.status, c.status),
        "stage": pipeline_stage(c), "resume_score": c.resume_score, "resume_confidence": c.resume_confidence,
        "qa_score": c.qa_score, "combined_score": c.combined_score, "band": c.band,
        "avg_confidence": c.avg_confidence, "flags": c.flags or [], "final_decision": c.final_decision,
        "interviewer": user_brief(iv.interviewer) if iv else None,
        "interview_date": iso(iv.scheduled_at) if iv else None,
        "interview_decision": iv.decision if iv else None,
        "experience_years": c.experience_years, "location": c.location, "profile_type": c.profile_type,
        "applied_at": iso(c.applied_at), "updated_at": iso(c.updated_at),
    }


def _answers(db: Session, cand_id: str) -> tuple[ScreeningAttempt | None, list[dict]]:
    attempt = (db.query(ScreeningAttempt).filter(ScreeningAttempt.candidate_id == cand_id)
               .order_by(ScreeningAttempt.id.desc()).first())
    if attempt is None:
        return None, []
    out = []
    for a in attempt.answers:
        out.append({
            "id": a.id, "question_id": a.question_id, "question": a.question.text,
            "answer_text": a.answer_text, "time_taken_sec": a.time_taken_sec,
            "time_limit_sec": a.time_limit_sec, "auto_submitted": a.auto_submitted,
            "telemetry": {"tab_switches": a.tab_switches, "paste_count": a.paste_count,
                          "copy_count": a.copy_count},
            "score_status": a.score_status, "score_error": a.score_error,
            "score": a.score.score if a.score else None,
            "justification": a.score.justification if a.score else None,
            "confidence": a.score.confidence if a.score else None,
            "rubric_hits": a.score.rubric_hits if a.score else [],
            "scored_by": f"{a.score.provider}/{a.score.model}" if a.score else None,
            "submitted_at": iso(a.submitted_at),
        })
    return attempt, out


def attempt_dict(attempt: ScreeningAttempt | None) -> dict | None:
    if attempt is None:
        return None
    return {
        "id": attempt.id, "status": attempt.status, "started_at": iso(attempt.started_at),
        "completed_at": iso(attempt.completed_at), "qa_total": attempt.qa_total, "qa_max": attempt.qa_max,
        "qa_normalized": attempt.qa_normalized, "combined_score": attempt.combined_score,
        "band": attempt.band, "avg_confidence": attempt.avg_confidence,
        "questions_total": len(attempt.question_ids), "answered": len(attempt.answers),
    }


def candidate_detail(db: Session, c: Candidate, viewer: User) -> dict:
    """Full drill-down for admin; interviewer gets the evidence but not the audit log."""
    iv = active_interview(db, c.id)
    rs = (db.query(ResumeScore).filter(ResumeScore.candidate_id == c.id, ResumeScore.is_current.is_(True))
          .order_by(ResumeScore.id.desc()).first())
    attempt, answers = _answers(db, c.id)
    telemetry = {
        "tab_switches": sum(a["telemetry"]["tab_switches"] for a in answers),
        "paste_count": sum(a["telemetry"]["paste_count"] for a in answers),
        "copy_count": sum(a["telemetry"]["copy_count"] for a in answers),
    }
    notes = (db.query(InterviewerNote).filter(InterviewerNote.candidate_id == c.id)
             .order_by(InterviewerNote.created_at.desc()).all())
    data = {
        **candidate_row(db, c, iv),
        "education": c.education, "resume_text": c.resume_text, "status_reason": c.status_reason,
        "jd": {"id": c.jd.id, "title": c.jd.title, "pass_threshold": c.jd.pass_threshold,
               "resume_weight": c.jd.resume_weight, "qa_weight": c.jd.qa_weight,
               "confidence_cutoff": c.jd.confidence_cutoff, "hold_margin": c.jd.hold_margin,
               "must_have": c.jd.must_have, "nice_to_have": c.jd.nice_to_have},
        "resume_analysis": None if rs is None else {
            "score": rs.score, "matched_skills": rs.matched_skills, "gaps": rs.gaps, "summary": rs.summary,
            "confidence": rs.confidence, "threshold_used": rs.threshold_used, "passed": rs.passed,
            "scored_by": f"{rs.provider}/{rs.model}", "latency_ms": rs.latency_ms,
            "created_at": iso(rs.created_at),
        },
        "attempt": attempt_dict(attempt),
        "answers": answers,
        "telemetry": telemetry,
        "interview": interview_dict(iv),
        "notes": [{"id": n.id, "body": n.body, "author": user_brief(n.author), "author_role": n.author.role,
                   "created_at": iso(n.created_at)} for n in notes],
        "next_steps": [{"id": s.id, "description": s.description, "author": user_brief(s.author),
                        "created_at": iso(s.created_at)}
                       for s in db.query(NextStep).filter(NextStep.candidate_id == c.id)
                       .order_by(NextStep.created_at.desc())],
        "status_history": [{"from_status": h.from_status, "to_status": h.to_status, "reason": h.reason,
                            "actor": h.actor_username, "created_at": iso(h.created_at)}
                           for h in db.query(CandidateStatusHistory)
                           .filter(CandidateStatusHistory.candidate_id == c.id)
                           .order_by(CandidateStatusHistory.created_at.asc(), CandidateStatusHistory.id.asc())],
    }
    if viewer.role == "admin":
        data["audit"] = [audit_dict(a) for a in db.query(AuditLog).filter(AuditLog.candidate_id == c.id)
                         .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(300)]
    return data


def audit_dict(a: AuditLog) -> dict:
    return {"id": a.id, "created_at": iso(a.created_at), "actor": a.actor_username, "role": a.actor_role,
            "candidate_id": a.candidate_id, "jd_id": a.jd_id, "event_type": a.event_type,
            "metadata": a.meta or {}}


def match_level(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 85:
        return "Strong"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Partial"
    return "Limited"


CANDIDATE_NEXT_STEPS = {
    Status.APPLIED: "Your application has been received and is waiting for resume review.",
    Status.FILTERED: "Thank you for applying. Your profile was not shortlisted for this role at this time.",
    Status.SCREENING: "You have been shortlisted. Complete the online screening Q&A to move forward.",
    Status.PASSED: "Great work on the screening. The hiring team will schedule your interview shortly.",
    Status.HOLD: "Your screening is under review by the hiring team. We will update you soon.",
    Status.REJECTED: "Thank you for your time. We will not be moving forward with your application.",
    Status.INTERVIEW_SCHEDULED: "Your interview is scheduled. Please join on time.",
    Status.ACCEPTED: "You cleared the interview. The hiring manager will share the final decision soon.",
    Status.ON_HOLD: "Your interview outcome is on hold. The hiring team will reach out.",
    Status.NO_SHOW: "We missed you at the interview. Please contact the recruiter to reschedule.",
    Status.HIRED: "Congratulations! You have been selected. HR will contact you with the offer.",
}


def candidate_self_view(db: Session, c: Candidate) -> dict:
    """What the candidate may see: status, dates, interviewer name, own aggregate result only."""
    iv = active_interview(db, c.id)
    attempt = (db.query(ScreeningAttempt).filter(ScreeningAttempt.candidate_id == c.id)
               .order_by(ScreeningAttempt.id.desc()).first())
    status = c.status
    label = STATUS_LABELS.get(status, status)
    if c.final_decision == "REJECTED":
        label = "Not Selected"
    return {
        "candidate_id": c.id, "name": c.name, "email": c.email,
        "job": {"id": c.jd.id, "title": c.jd.title, "location": c.jd.location},
        "applied_at": iso(c.applied_at), "status": status, "status_label": label,
        "stage": pipeline_stage(c),
        "next_step_message": ("We regret to inform you that you were not selected." if c.final_decision == "REJECTED"
                              else CANDIDATE_NEXT_STEPS.get(status, "")),
        "can_start_screening": status == Status.SCREENING and (attempt is None or attempt.status == "IN_PROGRESS"),
        "screening_in_progress": attempt is not None and attempt.status == "IN_PROGRESS",
        "screening_completed": attempt is not None and attempt.status == "COMPLETED",
        "interview": None if iv is None else {
            "scheduled_at": iso(iv.scheduled_at),
            "interviewer": {"name": iv.interviewer.display_name, "email": iv.interviewer.email},
        },
        "next_steps": [s.description for s in db.query(NextStep).filter(NextStep.candidate_id == c.id)
                       .order_by(NextStep.created_at.asc())]
        if status in (Status.PASSED, Status.INTERVIEW_SCHEDULED, Status.ACCEPTED, Status.HIRED) else [],
    }


def candidate_result_view(db: Session, c: Candidate) -> dict:
    attempt = (db.query(ScreeningAttempt).filter(ScreeningAttempt.candidate_id == c.id)
               .order_by(ScreeningAttempt.id.desc()).first())
    if attempt is None or attempt.status != "COMPLETED":
        return {"available": False}
    breakdown = []
    for i, a in enumerate(attempt.answers, start=1):
        breakdown.append({"label": f"Question {i}", "topic": a.question.text[:90],
                          "score": a.score.score if a.score else None, "max": 5})
    return {
        "available": attempt.band is not None,
        "pending_reason": None if attempt.band else "Your answers are being evaluated.",
        "aggregate_score": attempt.combined_score,
        "band": attempt.band,
        "categories": [
            {"name": "Profile match", "level": match_level(c.resume_score)},
            {"name": "Screening Q&A", "score": attempt.qa_normalized, "max": 100},
        ],
        "breakdown": breakdown,
        "completed_at": iso(attempt.completed_at),
    }


def jd_counts(db: Session, jd: JobDescription) -> dict:
    cands = db.query(Candidate.status).filter(Candidate.jd_id == jd.id).all()
    statuses = [s for (s,) in cands]
    return {
        "candidate_count": len(statuses),
        "pending_count": statuses.count(Status.APPLIED),
        "screening_count": statuses.count(Status.SCREENING),
        "filtered_count": statuses.count(Status.FILTERED),
        "question_count": len(jd.questions),
    }
