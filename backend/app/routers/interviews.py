from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit import Event, change_status, record
from ..database import get_db
from ..deps import active_interview, current_user, get_candidate_or_404, require_admin, require_roles
from ..models import Candidate, Interview, Role, Status, User
from ..schemas import InterviewCreate, InterviewUpdate
from ..views import candidate_row, interview_dict

router = APIRouter(tags=["interviews"])

ASSIGNABLE = (Status.PASSED, Status.HOLD, Status.INTERVIEW_SCHEDULED, Status.ON_HOLD, Status.NO_SHOW)


def _interviewer(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if u is None or u.role != Role.INTERVIEWER:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "interviewer_id must be an interviewer user")
    return u


@router.post("/interviews", status_code=201)
def create_interview(body: InterviewCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    cand = get_candidate_or_404(db, body.candidate_id)
    if cand.status not in ASSIGNABLE:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Candidate must have completed screening (PASSED/HOLD) to be assigned; current: {cand.status}")
    interviewer = _interviewer(db, body.interviewer_id)
    prev = active_interview(db, cand.id)
    if prev:
        prev.status = "CANCELLED"
    iv = Interview(candidate_id=cand.id, interviewer_id=interviewer.id, scheduled_at=body.scheduled_at,
                   created_by=admin.id)
    db.add(iv)
    db.flush()
    record(db, Event.INTERVIEW_ASSIGNED, admin, cand.id, cand.jd_id, interview_id=iv.id,
           interviewer=interviewer.username,
           scheduled_at=body.scheduled_at.isoformat() if body.scheduled_at else None,
           replaced_interview_id=prev.id if prev else None)
    change_status(db, cand, Status.INTERVIEW_SCHEDULED,
                  f"Interview assigned to {interviewer.display_name}", admin)
    db.commit()
    db.refresh(iv)
    return interview_dict(iv)


@router.put("/interviews/{interview_id}")
def update_interview(interview_id: int, body: InterviewUpdate, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    iv = db.get(Interview, interview_id)
    if iv is None or iv.status == "CANCELLED":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    cand = db.get(Candidate, iv.candidate_id)
    if body.interviewer_id is not None and body.interviewer_id != iv.interviewer_id:
        new = _interviewer(db, body.interviewer_id)
        record(db, Event.INTERVIEWER_CHANGED, admin, cand.id, cand.jd_id, interview_id=iv.id,
               from_interviewer=iv.interviewer.username, to_interviewer=new.username)
        iv.interviewer_id = new.id
        iv.interviewer = new
    if "scheduled_at" in body.model_fields_set and body.scheduled_at != iv.scheduled_at:
        record(db, Event.INTERVIEW_DATE_UPDATED, admin, cand.id, cand.jd_id, interview_id=iv.id,
               from_date=iv.scheduled_at.isoformat() if iv.scheduled_at else None,
               to_date=body.scheduled_at.isoformat() if body.scheduled_at else None)
        iv.scheduled_at = body.scheduled_at
    db.commit()
    db.refresh(iv)
    return interview_dict(iv)


@router.get("/interviews")
def list_interviews(db: Session = Depends(get_db), user: User = Depends(require_roles(Role.ADMIN, Role.INTERVIEWER))):
    q = db.query(Interview).filter(Interview.status != "CANCELLED")
    if user.role == Role.INTERVIEWER:
        q = q.filter(Interview.interviewer_id == user.id)
    out = []
    for iv in q.order_by(Interview.scheduled_at.asc()).all():
        cand = db.get(Candidate, iv.candidate_id)
        out.append({**interview_dict(iv), "candidate": {"id": cand.id, "name": cand.name, "jd_title": cand.jd.title,
                                                        "status": cand.status}})
    return out


@router.get("/interviewer/candidates")
def my_assigned_candidates(db: Session = Depends(get_db), user: User = Depends(require_roles(Role.INTERVIEWER))):
    ivs = (db.query(Interview).filter(Interview.interviewer_id == user.id, Interview.status != "CANCELLED")
           .order_by(Interview.scheduled_at.asc()).all())
    return [candidate_row(db, db.get(Candidate, iv.candidate_id), iv) for iv in ivs]
