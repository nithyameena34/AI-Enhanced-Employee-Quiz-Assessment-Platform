from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime


class AssessmentIn(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = ""
    assessment_type: Literal["quiz", "document"]
    quiz_id: Optional[int] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=480)
    starts_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None
    max_marks: float = Field(default=100, gt=0)


class AssignmentIn(BaseModel):
    employee_ids: list[int] = Field(min_length=1)


class EvaluationIn(BaseModel):
    marks_obtained: float = Field(ge=0)
    feedback: str = Field(default="", max_length=5000)


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Literal["employee", "admin"] = "employee"
    admin_code: str = ""

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    role: Literal["employee", "admin"]

class QuizIn(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = ""
    duration_minutes: int = Field(default=20, ge=1, le=240)

class QuestionIn(BaseModel):
    question_text: str = Field(min_length=3)
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: Literal["A", "B", "C", "D"]
    explanation: str = ""

class AnswerIn(BaseModel):
    question_id: int
    selected_option: Literal["A", "B", "C", "D"]

class SubmitIn(BaseModel):
    answers: list[AnswerIn]

class ImportQuestionsIn(BaseModel):
    quiz_id: int
