"""SQLAlchemy ORM models (normalized schema; works on SQLite and PostgreSQL)."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


TS = DateTime(timezone=True)


class Role:
    ADMIN = "admin"
    CANDIDATE = "candidate"
    INTERVIEWER = "interviewer"
    ALL = (ADMIN, CANDIDATE, INTERVIEWER)


class Status:
    APPLIED = "APPLIED"
    FILTERED = "FILTERED"  # below resume threshold, archived with reason
    SCREENING = "SCREENING"  # promoted; Q&A pending / in progress
    PASSED = "PASSED"
    HOLD = "HOLD"
    REJECTED = "REJECTED"
    INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED"
    ACCEPTED = "ACCEPTED"
    ON_HOLD = "ON_HOLD"
    NO_SHOW = "NO_SHOW"
    HIRED = "HIRED"
    ALL = (
        APPLIED, FILTERED, SCREENING, PASSED, HOLD, REJECTED,
        INTERVIEW_SCHEDULED, ACCEPTED, ON_HOLD, NO_SHOW, HIRED,
    )
    INTERVIEWER_DECISIONS = (ACCEPTED, REJECTED, ON_HOLD, NO_SHOW)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), index=True)
    display_name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class JobDescription(Base):
    __tablename__ = "job_descriptions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    must_have: Mapped[list] = mapped_column(JSON, default=list)
    nice_to_have: Mapped[list] = mapped_column(JSON, default=list)
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    education: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    resume_weight: Mapped[float] = mapped_column(Float, default=0.6)
    qa_weight: Mapped[float] = mapped_column(Float, default=0.4)
    pass_threshold: Mapped[float] = mapped_column(Float, default=70)
    hold_margin: Mapped[float] = mapped_column(Float, default=10)
    confidence_cutoff: Mapped[float] = mapped_column(Float, default=0.6)
    question_time_limit_sec: Mapped[int] = mapped_column(Integer, default=180)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_screened_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="jd", order_by="Question.order_index", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    jd_id: Mapped[str] = mapped_column(ForeignKey("job_descriptions.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    reference_answer: Mapped[str] = mapped_column(Text, default="")
    rubric: Mapped[dict] = mapped_column(JSON, default=dict)

    jd: Mapped[JobDescription] = relationship(back_populates="questions")


class Candidate(Base):
    __tablename__ = "candidates"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True)
    jd_id: Mapped[str] = mapped_column(ForeignKey("job_descriptions.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str] = mapped_column(String(256))
    experience_years: Mapped[int] = mapped_column(Integer, default=0)
    education: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    profile_type: Mapped[str] = mapped_column(String(64), default="")
    resume_text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default=Status.APPLIED, index=True)
    status_reason: Mapped[str | None] = mapped_column(Text)
    applied_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    # Denormalized latest scores (source records live in resume_scores / screening_attempts)
    resume_score: Mapped[float | None] = mapped_column(Float)
    resume_confidence: Mapped[float | None] = mapped_column(Float)
    qa_score: Mapped[float | None] = mapped_column(Float)  # normalized 0-100
    combined_score: Mapped[float | None] = mapped_column(Float)
    band: Mapped[str | None] = mapped_column(String(16))  # PASS | HOLD | REJECT
    avg_confidence: Mapped[float | None] = mapped_column(Float)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    final_decision: Mapped[str | None] = mapped_column(String(16))  # HIRED | REJECTED
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)

    user: Mapped[User | None] = relationship()
    jd: Mapped[JobDescription] = relationship()


class ResumeScore(Base):
    __tablename__ = "resume_scores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    jd_id: Mapped[str] = mapped_column(ForeignKey("job_descriptions.id", ondelete="CASCADE"))
    score: Mapped[float] = mapped_column(Float)
    matched_skills: Mapped[list] = mapped_column(JSON, default=list)
    gaps: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float)
    threshold_used: Mapped[float] = mapped_column(Float)
    passed: Mapped[bool] = mapped_column(Boolean)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class ScreeningAttempt(Base):
    __tablename__ = "screening_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    jd_id: Mapped[str] = mapped_column(ForeignKey("job_descriptions.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="IN_PROGRESS")  # IN_PROGRESS | COMPLETED
    started_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(TS)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    current_question_started_at: Mapped[datetime | None] = mapped_column(TS)
    question_ids: Mapped[list] = mapped_column(JSON, default=list)
    qa_total: Mapped[float | None] = mapped_column(Float)
    qa_max: Mapped[float | None] = mapped_column(Float)
    qa_normalized: Mapped[float | None] = mapped_column(Float)
    combined_score: Mapped[float | None] = mapped_column(Float)
    band: Mapped[str | None] = mapped_column(String(16))
    avg_confidence: Mapped[float | None] = mapped_column(Float)

    answers: Mapped[list["Answer"]] = relationship(back_populates="attempt", order_by="Answer.id")


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_answer_attempt_question"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("screening_attempts.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    answer_text: Mapped[str] = mapped_column(Text, default="")
    time_taken_sec: Mapped[int] = mapped_column(Integer, default=0)
    time_limit_sec: Mapped[int] = mapped_column(Integer, default=0)
    auto_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    tab_switches: Mapped[int] = mapped_column(Integer, default=0)
    paste_count: Mapped[int] = mapped_column(Integer, default=0)
    copy_count: Mapped[int] = mapped_column(Integer, default=0)
    score_status: Mapped[str] = mapped_column(String(16), default="PENDING")  # PENDING | SCORED | FAILED
    score_error: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    attempt: Mapped[ScreeningAttempt] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()
    score: Mapped["AnswerScore | None"] = relationship(back_populates="answer", uselist=False)


class AnswerScore(Base):
    __tablename__ = "answer_scores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("answers.id", ondelete="CASCADE"), unique=True)
    score: Mapped[float] = mapped_column(Float)
    justification: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float)
    rubric_hits: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    answer: Mapped[Answer] = relationship(back_populates="score")


class Interview(Base):
    __tablename__ = "interviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    interviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(TS)
    status: Mapped[str] = mapped_column(String(16), default="SCHEDULED")  # SCHEDULED | COMPLETED | CANCELLED
    decision: Mapped[str | None] = mapped_column(String(16))
    decided_at: Mapped[datetime | None] = mapped_column(TS)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)

    interviewer: Mapped[User] = relationship(foreign_keys=[interviewer_id])


class InterviewerNote(Base):
    __tablename__ = "interviewer_notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    interview_id: Mapped[int | None] = mapped_column(ForeignKey("interviews.id", ondelete="SET NULL"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    author: Mapped[User] = relationship()


class CandidateStatusHistory(Base):
    __tablename__ = "candidate_status_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_username: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class NextStep(Base):
    __tablename__ = "next_steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    author: Mapped[User | None] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_created", "created_at"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_username: Mapped[str | None] = mapped_column(String(64))
    actor_role: Mapped[str | None] = mapped_column(String(16))
    candidate_id: Mapped[str | None] = mapped_column(ForeignKey("candidates.id", ondelete="SET NULL"), index=True)
    jd_id: Mapped[str | None] = mapped_column(String(32))
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
