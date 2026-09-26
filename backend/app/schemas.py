"""Pydantic request/response schemas for the REST API."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)
    role: str | None = Field(default=None, description="Optional: role selected on the login screen")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    display_name: str
    email: str | None = None
    candidate_id: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class JDBase(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    summary: str = ""
    must_have: list[str] = Field(default_factory=list)
    nice_to_have: list[str] = Field(default_factory=list)
    experience_years: int = Field(ge=0, le=50, default=0)
    education: str = ""
    location: str = ""
    resume_weight: float = Field(ge=0, le=1, default=0.6)
    qa_weight: float = Field(ge=0, le=1, default=0.4)
    pass_threshold: float = Field(ge=0, le=100, default=70)
    hold_margin: float = Field(ge=0, le=100, default=10)
    confidence_cutoff: float = Field(ge=0, le=1, default=0.6)
    question_time_limit_sec: int = Field(ge=15, le=1800, default=180)
    is_active: bool = True

    @field_validator("must_have", "nice_to_have")
    @classmethod
    def clean_skills(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s and s.strip()]

    @model_validator(mode="after")
    def weights_sum_to_one(self):
        if abs(self.resume_weight + self.qa_weight - 1.0) > 0.001:
            raise ValueError("resume_weight + qa_weight must equal 1.0 (e.g. 0.6 + 0.4)")
        return self


class JDCreate(JDBase):
    must_have: list[str] = Field(min_length=1)


class JDUpdate(JDBase):
    pass


class QuestionIn(BaseModel):
    text: str = Field(min_length=5)
    reference_answer: str = ""
    rubric: dict = Field(default_factory=dict)


class JDOut(JDBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    last_screened_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    candidate_count: int = 0
    pending_count: int = 0
    screening_count: int = 0
    filtered_count: int = 0
    question_count: int = 0


class Telemetry(BaseModel):
    tab_switches: int = Field(ge=0, le=10_000, default=0)
    paste_count: int = Field(ge=0, le=10_000, default=0)
    copy_count: int = Field(ge=0, le=10_000, default=0)


class AnswerSubmit(BaseModel):
    question_id: str
    answer_text: str = Field(default="", max_length=10_000)
    auto_submitted: bool = False
    time_taken_sec: int | None = Field(default=None, ge=0, le=36_000)
    telemetry: Telemetry = Field(default_factory=Telemetry)


class InterviewCreate(BaseModel):
    candidate_id: str
    interviewer_id: int
    scheduled_at: datetime | None = None


class InterviewUpdate(BaseModel):
    interviewer_id: int | None = None
    scheduled_at: datetime | None = None


class StatusUpdate(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=2000)


class FinalDecision(BaseModel):
    decision: str = Field(pattern="^(HIRED|REJECTED)$")
    reason: str | None = Field(default=None, max_length=2000)


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class NextStepCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)


class PromoteRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


class ScreenRequest(BaseModel):
    force: bool = False
