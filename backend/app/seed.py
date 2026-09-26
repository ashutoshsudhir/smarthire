"""Seed the supplied Input_Data.json (source of truth) into the database. Idempotent."""
import json
import logging
from datetime import timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from .config import get_settings
from .models import Candidate, JobDescription, Question, Status, User, utcnow
from .security import hash_password

log = logging.getLogger("smarthire.seed")


def _display_name(username: str, role: str) -> str:
    num = "".join(ch for ch in username if ch.isdigit())
    return {"admin": f"Hiring Manager {num}", "interviewer": f"Interviewer {num}"}.get(role, username)


def seed(db: Session, path: str | None = None) -> dict:
    if db.query(User).first() is not None:
        return {"seeded": False, "reason": "database already contains users"}
    data = json.loads(Path(path or get_settings().seed_file).read_text())
    now = utcnow()

    users: dict[str, User] = {}
    cand_by_user = {c["user"]: c for c in data["candidates"]}
    for u in data["users"]:
        cand = cand_by_user.get(u["username"])
        user = User(
            username=u["username"], role=u["role"], password_hash=hash_password(u["password"]),
            display_name=cand["name"] if cand else _display_name(u["username"], u["role"]),
            email=cand["email"] if cand else f"{u['username']}@example.com",
        )
        db.add(user)
        users[u["username"]] = user
    db.flush()

    for jd in data["job_descriptions"]:
        db.add(JobDescription(
            id=jd["id"], title=jd["title"], summary=jd.get("summary", ""), must_have=jd["must_have"],
            nice_to_have=jd.get("nice_to_have", []), experience_years=jd.get("experience_years", 0),
            education=jd.get("education", ""), location=jd.get("location", ""),
            resume_weight=jd["weights"]["resume"], qa_weight=jd["weights"]["qa"],
            pass_threshold=jd["pass_threshold"], confidence_cutoff=jd.get("confidence_cutoff", 0.6),
        ))
    db.flush()

    order: dict[str, int] = {}
    for q in data["questions"]:
        idx = order.get(q["jd_id"], 0)
        order[q["jd_id"]] = idx + 1
        db.add(Question(id=q["id"], jd_id=q["jd_id"], order_index=idx, text=q["text"],
                        reference_answer=q.get("reference_answer", ""), rubric=q.get("rubric", {})))

    for i, c in enumerate(data["candidates"]):
        db.add(Candidate(
            id=c["id"], user_id=users[c["user"]].id if c.get("user") in users else None, jd_id=c["applied_jd"],
            name=c["name"], email=c["email"], experience_years=c.get("experience_years", 0),
            education=c.get("education", ""), location=c.get("location", ""),
            profile_type=c.get("profile_type", ""),
            resume_text=c.get("resume") or c.get("resume_text", ""),
            status=Status.APPLIED, applied_at=now - timedelta(days=10 - i, hours=i),
        ))
    db.commit()
    counts = {"users": len(data["users"]), "job_descriptions": len(data["job_descriptions"]),
              "questions": len(data["questions"]), "candidates": len(data["candidates"])}
    log.info("seeded %s", counts)
    return {"seeded": True, **counts}
