
from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Float,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


# =========================================================
# USER MODEL
# =========================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(
        String(120), nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    role: Mapped[str] = mapped_column(
        String(20), default="employee", nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    attempts = relationship(
        "Attempt", back_populates="user"
    )


# =========================================================
# QUIZ MODEL
# =========================================================

class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    title: Mapped[str] = mapped_column(
        String(180), nullable=False
    )

    description: Mapped[str] = mapped_column(
        Text, default=""
    )

    duration_minutes: Mapped[int] = mapped_column(
        Integer, default=20
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    questions = relationship(
        "Question",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )

    attempts = relationship(
        "Attempt", back_populates="quiz"
    )


# =========================================================
# QUESTION MODEL
# =========================================================

class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id"), nullable=False
    )

    question_text: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    option_a: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    option_b: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    option_c: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    option_d: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    correct_option: Mapped[str] = mapped_column(
        String(1), nullable=False
    )

    explanation: Mapped[str] = mapped_column(
        Text, default=""
    )

    quiz = relationship(
        "Quiz", back_populates="questions"
    )


# =========================================================
# ATTEMPT MODEL
# =========================================================

class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )

    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id"), nullable=False
    )

    score: Mapped[int] = mapped_column(
        Integer, default=0
    )

    total_questions: Mapped[int] = mapped_column(
        Integer, default=0
    )

    percentage: Mapped[float] = mapped_column(
        Float, default=0
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    user = relationship(
        "User", back_populates="attempts"
    )

    quiz = relationship(
        "Quiz", back_populates="attempts"
    )


# =========================================================
# ASSESSMENT MODEL
# =========================================================

class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    title: Mapped[str] = mapped_column(
        String(180), nullable=False
    )

    description: Mapped[str] = mapped_column(
        Text, default=""
    )

    assessment_type: Mapped[str] = mapped_column(
        String(20), default="quiz", nullable=False
    )

    quiz_id: Mapped[int | None] = mapped_column(
        ForeignKey("quizzes.id"), nullable=True
    )

    duration_minutes: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    max_marks: Mapped[float] = mapped_column(
        Float, default=100
    )

    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    quiz = relationship("Quiz")

    creator = relationship(
        "User", foreign_keys=[created_by]
    )

    assignments = relationship(
        "AssessmentAssignment",
        back_populates="assessment",
        cascade="all, delete-orphan",
    )


# =========================================================
# ASSESSMENT ASSIGNMENT MODEL
# =========================================================

class AssessmentAssignment(Base):
    __tablename__ = "assessment_assignments"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "user_id",
            name="uq_assessment_employee",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id"), nullable=False
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )

    assessment = relationship(
        "Assessment", back_populates="assignments"
    )

    employee = relationship("User")

    document_submission = relationship(
        "DocumentSubmission",
        back_populates="assignment",
        uselist=False,
        cascade="all, delete-orphan",
    )


# =========================================================
# DOCUMENT SUBMISSION MODEL
# =========================================================

class DocumentSubmission(Base):
    __tablename__ = "document_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assessment_assignments.id"),
        unique=True,
        nullable=False,
    )

    file_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    stored_path: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    content_type: Mapped[str] = mapped_column(
        String(100), default=""
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    marks_obtained: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    feedback: Mapped[str] = mapped_column(
        Text, default=""
    )

    evaluated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    evaluated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    assignment = relationship(
        "AssessmentAssignment",
        back_populates="document_submission",
    )

    evaluator = relationship(
        "User", foreign_keys=[evaluated_by]
    )


# =========================================================
# AI REPORT MODEL - NEW
# =========================================================

class AIReport(Base):
    __tablename__ = "ai_reports"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    # Employee who owns this report
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    # Assessment assignment associated with this report
    assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey("assessment_assignments.id"),
        nullable=True,
        index=True
    )

    # Quiz attempt associated with this report
    # Unique prevents duplicate reports for one attempt
    attempt_id: Mapped[int | None] = mapped_column(
        ForeignKey("attempts.id"),
        nullable=True,
        unique=True
    )

    # Document submission associated with this report
    # Unique prevents duplicate reports for one submission
    submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_submissions.id"),
        nullable=True,
        unique=True
    )

    # Report type: quiz or document
    report_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )

    # Assessment or quiz title
    title: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    # Complete AI-generated feedback
    feedback: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    # Performance information
    score: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    total: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    percentage: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
