import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import Event, record
from ..database import get_db
from ..deps import current_user, require_admin
from ..models import Candidate, JobDescription, Question, ResumeScore, Role, User
from ..schemas import JDCreate, JDOut, JDUpdate, QuestionIn, ScreenRequest
from ..services.scoring import screen_jd
from ..views import candidate_row, jd_counts

router = APIRouter(prefix="/jds", tags=["job descriptions"])


def _get(db: Session, jd_id: str) -> JobDescription:
    jd = db.get(JobDescription, jd_id)
    if jd is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job description not found")
    return jd


def _out(db: Session, jd: JobDescription) -> JDOut:
    return JDOut.model_validate({**{c.name: getattr(jd, c.name) for c in jd.__table__.columns},
                                 **jd_counts(db, jd)})


@router.get("", response_model=list[JDOut])
def list_jds(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return [_out(db, jd) for jd in db.query(JobDescription).order_by(JobDescription.id)]


@router.post("", response_model=JDOut, status_code=201)
def create_jd(body: JDCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    nums = [int(m.group(1)) for (i,) in db.query(JobDescription.id) if (m := re.match(r"jd-(\d+)$", i))]
    jd = JobDescription(id=f"jd-{max(nums, default=0) + 1}", **body.model_dump())
    db.add(jd)
    record(db, Event.JD_CREATED, admin, None, jd.id, title=jd.title)
    db.commit()
    return _out(db, jd)


@router.get("/{jd_id}")
def get_jd(jd_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    jd = _get(db, jd_id)
    cands = db.query(Candidate).filter(Candidate.jd_id == jd_id).all()
    evidence = {
        rs.candidate_id: {"matched_skills": rs.matched_skills, "gaps": rs.gaps, "summary": rs.summary,
                          "confidence": rs.confidence}
        for rs in db.query(ResumeScore).filter(ResumeScore.jd_id == jd_id, ResumeScore.is_current.is_(True))
    }
    rows = sorted(({**candidate_row(db, c), "resume_analysis": evidence.get(c.id)} for c in cands),
                  key=lambda r: (r["combined_score"] or -1, r["resume_score"] or -1), reverse=True)
    return {
        "jd": _out(db, jd).model_dump(mode="json"),
        "questions": [{"id": q.id, "text": q.text, "reference_answer": q.reference_answer, "rubric": q.rubric}
                      for q in jd.questions],
        "candidates": rows,
    }


@router.put("/{jd_id}", response_model=JDOut)
def update_jd(jd_id: str, body: JDUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    jd = _get(db, jd_id)
    changes = {}
    for k, v in body.model_dump().items():
        if getattr(jd, k) != v:
            changes[k] = {"from": getattr(jd, k), "to": v}
            setattr(jd, k, v)
    record(db, Event.JD_UPDATED, admin, None, jd.id, changes=changes)
    db.commit()
    return _out(db, jd)


@router.delete("/{jd_id}", status_code=204)
def delete_jd(jd_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    jd = _get(db, jd_id)
    if db.query(func.count(Candidate.id)).filter(Candidate.jd_id == jd_id).scalar():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "JD has candidates; deactivate it (is_active=false) instead of deleting")
    db.delete(jd)
    record(db, Event.JD_DELETED, admin, None, jd_id, title=jd.title)
    db.commit()


@router.post("/{jd_id}/questions", status_code=201)
def add_question(jd_id: str, body: QuestionIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    jd = _get(db, jd_id)
    qid = f"q-{jd_id}-{len(jd.questions) + 1:02d}"
    while db.get(Question, qid):
        qid += "x"
    q = Question(id=qid, jd_id=jd_id, order_index=len(jd.questions), **body.model_dump())
    db.add(q)
    record(db, Event.JD_UPDATED, admin, None, jd_id, question_added=qid)
    db.commit()
    return {"id": q.id, "text": q.text, "reference_answer": q.reference_answer, "rubric": q.rubric}


@router.post("/{jd_id}/screen")
def screen(jd_id: str, body: ScreenRequest | None = None, db: Session = Depends(get_db),
           admin: User = Depends(require_admin)):
    """Run resume_match for this JD's candidates; promote >= threshold, archive the rest."""
    jd = _get(db, jd_id)
    return screen_jd(db, jd, admin, force=bool(body and body.force))
