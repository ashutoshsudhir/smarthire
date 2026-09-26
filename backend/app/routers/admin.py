from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import bearer, current_user, require_admin
from ..llm_client import provider_info
from ..models import AuditLog, Candidate, Interview, JobDescription, Role, Status, User
from ..services.scoring import screen_jd
from ..views import PIPELINE_STAGES, audit_dict, pipeline_stage

router = APIRouter(tags=["admin"])


@router.get("/dashboard/stats")
def dashboard(jd_id: str | None = None, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(Candidate)
    if jd_id:
        q = q.filter(Candidate.jd_id == jd_id)
    cands = q.all()
    by_status: dict[str, int] = {}
    for c in cands:
        by_status[c.status] = by_status.get(c.status, 0) + 1
    stages = {s: 0 for s in PIPELINE_STAGES}
    for c in cands:
        stages[pipeline_stage(c)] += 1
    # Funnel: how many reached at least each stage
    order = PIPELINE_STAGES
    reached = []
    for i, s in enumerate(order):
        if s == "Resume Screened":
            n = sum(1 for c in cands if c.resume_score is not None)
        elif s == "Screening":
            n = sum(1 for c in cands if c.resume_score is not None and c.status != Status.FILTERED)
        else:
            n = sum(1 for c in cands if order.index(pipeline_stage(c)) >= i)
        reached.append({"stage": s, "count": n})
    flagged = sum(1 for c in cands if c.flags)
    scored = [c.combined_score for c in cands if c.combined_score is not None]
    return {
        "total_candidates": len(cands),
        "filtered": by_status.get(Status.FILTERED, 0),
        "screening": by_status.get(Status.SCREENING, 0),
        "interviews_scheduled": by_status.get(Status.INTERVIEW_SCHEDULED, 0),
        "accepted": by_status.get(Status.ACCEPTED, 0) + by_status.get(Status.HIRED, 0),
        "rejected": by_status.get(Status.REJECTED, 0),
        "hold": by_status.get(Status.HOLD, 0) + by_status.get(Status.ON_HOLD, 0),
        "no_show": by_status.get(Status.NO_SHOW, 0),
        "passed": by_status.get(Status.PASSED, 0),
        "hired": by_status.get(Status.HIRED, 0),
        "pending_resume_screening": by_status.get(Status.APPLIED, 0),
        "flagged": flagged,
        "avg_combined_score": round(sum(scored) / len(scored), 1) if scored else None,
        "by_status": by_status,
        "stages": stages,
        "funnel": reached,
        "jobs": db.query(func.count(JobDescription.id)).scalar(),
        "upcoming_interviews": db.query(func.count(Interview.id)).filter(Interview.status == "SCHEDULED").scalar(),
        "llm": {"provider": provider_info()[0], "model": provider_info()[1]},
    }


@router.get("/audit-logs")
def audit_logs(
    candidate_id: str | None = None,
    event_type: str | None = None,
    actor: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(AuditLog)
    if candidate_id:
        q = q.filter(AuditLog.candidate_id == candidate_id)
    if event_type:
        q = q.filter(AuditLog.event_type.in_(event_type.split(",")))
    if actor:
        q = q.filter(AuditLog.actor_username == actor)
    total = q.count()
    items = q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [audit_dict(a) for a in items], "limit": limit, "offset": offset}


@router.get("/users")
def list_users(role: str | None = None, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [{"id": u.id, "username": u.username, "role": u.role, "display_name": u.display_name, "email": u.email}
            for u in q.order_by(User.id)]


@router.post("/screening/run-batch")
def run_batch(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_admin_token: str | None = Header(default=None),
):
    """Batch job: screen every active JD's unscored resumes. Callable by an admin or by a
    scheduler (cron) presenting X-Admin-Token == ADMIN_API_TOKEN."""
    s = get_settings()
    actor = None
    if x_admin_token and s.admin_api_token and x_admin_token == s.admin_api_token:
        actor = None
    else:
        user = current_user(creds, db)
        if user.role != Role.ADMIN:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
        actor = user
    results = [screen_jd(db, jd, actor) for jd in db.query(JobDescription).filter(JobDescription.is_active.is_(True))]
    return {"jobs": results}
