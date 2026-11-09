
import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Body
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    User,
    Quiz,
    Question,
    Attempt,
    Assessment,
    AssessmentAssignment,
    DocumentSubmission
)
from backend.app.schemas import (
    QuizIn,
    QuestionIn,
    AssessmentIn,
    AssignmentIn,
    EvaluationIn
)
from backend.app.security import require_admin, hash_password


router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ---------------------------------------------------------
# DATE AND TIME HELPERS
# ---------------------------------------------------------

# datetime-local values entered by the admin are interpreted as IST.
# The database stores naive UTC datetimes because the assessment
# router compares dates using datetime.utcnow().

IST = ZoneInfo("Asia/Kolkata")


def _to_utc_naive(value):
    """Convert an incoming datetime or ISO string to naive UTC."""
    if value is None:
        return None

    if isinstance(value, str):
        value = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

    if not isinstance(value, datetime):
        raise ValueError("Invalid date/time value")

    if value.tzinfo is None:
        value = value.replace(tzinfo=IST)

    return value.astimezone(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------
# DASHBOARD OVERVIEW
# ---------------------------------------------------------

@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    attempts = db.query(Attempt).all()

    average = (
        sum(a.percentage for a in attempts) / len(attempts)
        if attempts else 0
    )

    return {
        "employees": db.query(User).filter(
            User.role == "employee"
        ).count(),

        "quizzes": db.query(Quiz).count(),

        "questions": db.query(Question).count(),

        "attempts": len(attempts),

        "average_score": round(average, 1),

        "assessments": db.query(Assessment).count(),

        "pending_assignments": db.query(
            AssessmentAssignment
        ).filter(
            AssessmentAssignment.status == "pending"
        ).count(),

        "document_submissions": db.query(
            DocumentSubmission
        ).count()
    }


# ---------------------------------------------------------
# EMPLOYEE MANAGEMENT
# ---------------------------------------------------------

@router.get("/users")
def users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    employees = db.query(User).order_by(
        User.id.desc()
    ).all()

    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": (
                u.created_at.isoformat()
                if u.created_at else None
            )
        }
        for u in employees
    ]


@router.post("/users", status_code=201)
def create_employee(
    data: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if len(name) < 2:
        raise HTTPException(
            400,
            "Name must contain at least 2 characters"
        )

    if "@" not in email or "." not in email:
        raise HTTPException(
            400,
            "Enter a valid email address"
        )

    if len(password) < 8 or len(password) > 72:
        raise HTTPException(
            400,
            "Password must contain 8 to 72 characters"
        )

    existing = db.query(User).filter(
        User.email == email
    ).first()

    if existing:
        raise HTTPException(
            409,
            "Email already registered"
        )

    employee = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role="employee",
        is_active=True
    )

    db.add(employee)
    db.commit()
    db.refresh(employee)

    return {
        "id": employee.id,
        "name": employee.name,
        "email": employee.email,
        "message": "Employee created successfully"
    }


@router.patch("/users/{user_id}")
def update_employee(
    user_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    employee = db.get(User, user_id)

    if not employee or employee.role != "employee":
        raise HTTPException(
            404,
            "Employee not found"
        )

    if "name" in data:
        name = str(data["name"]).strip()

        if len(name) < 2:
            raise HTTPException(
                400,
                "Invalid employee name"
            )

        employee.name = name

    if "email" in data:
        email = str(data["email"]).strip().lower()

        if "@" not in email or "." not in email:
            raise HTTPException(
                400,
                "Invalid email address"
            )

        existing = db.query(User).filter(
            User.email == email,
            User.id != user_id
        ).first()

        if existing:
            raise HTTPException(
                409,
                "Email already registered"
            )

        employee.email = email

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise HTTPException(
                400,
                "is_active must be true or false"
            )

        employee.is_active = data["is_active"]

    db.commit()
    db.refresh(employee)

    return {
        "message": "Employee updated successfully",
        "id": employee.id
    }


@router.delete("/users/{user_id}")
def deactivate_employee(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    employee = db.get(User, user_id)

    if not employee or employee.role != "employee":
        raise HTTPException(
            404,
            "Employee not found"
        )

    employee.is_active = False
    db.commit()

    return {
        "message": "Employee deactivated successfully"
    }


# ---------------------------------------------------------
# QUIZ MANAGEMENT
# ---------------------------------------------------------

@router.post("/quizzes", status_code=201)
def create_quiz(
    data: QuizIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = Quiz(**data.model_dump())

    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return {
        "id": quiz.id,
        "title": quiz.title,
        "message": "Quiz created successfully"
    }


@router.get("/quizzes")
def list_quizzes(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quizzes = db.query(Quiz).order_by(
        Quiz.id.desc()
    ).all()

    return [
        {
            "id": q.id,
            "title": q.title,
            "description": q.description,
            "duration_minutes": q.duration_minutes,
            "is_active": q.is_active,
            "question_count": len(q.questions)
        }
        for q in quizzes
    ]


@router.patch("/quizzes/{quiz_id}")
def update_quiz(
    quiz_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz:
        raise HTTPException(
            404,
            "Quiz not found"
        )

    if "title" in data:
        title = str(data["title"]).strip()

        if len(title) < 3 or len(title) > 180:
            raise HTTPException(
                400,
                "Quiz title must be 3-180 characters"
            )

        quiz.title = title

    if "description" in data:
        quiz.description = str(data["description"])

    if "duration_minutes" in data:
        duration = data["duration_minutes"]

        if (
            not isinstance(duration, int)
            or isinstance(duration, bool)
            or not 1 <= duration <= 240
        ):
            raise HTTPException(
                400,
                "Duration must be 1-240 minutes"
            )

        quiz.duration_minutes = duration

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise HTTPException(
                400,
                "is_active must be true or false"
            )

        quiz.is_active = data["is_active"]

    db.commit()

    return {
        "message": "Quiz updated successfully"
    }


@router.delete("/quizzes/{quiz_id}")
def deactivate_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz:
        raise HTTPException(
            404,
            "Quiz not found"
        )

    quiz.is_active = False
    db.commit()

    return {
        "message": "Quiz deactivated successfully"
    }


@router.post(
    "/quizzes/{quiz_id}/questions",
    status_code=201
)
def add_question(
    quiz_id: int,
    data: QuestionIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz:
        raise HTTPException(
            404,
            "Quiz not found"
        )

    question = Question(
        quiz_id=quiz_id,
        **data.model_dump()
    )

    db.add(question)
    db.commit()
    db.refresh(question)

    return {
        "id": question.id,
        "message": "Question added successfully"
    }


# ---------------------------------------------------------
# CSV QUESTION IMPORT
# ---------------------------------------------------------

@router.post("/quizzes/{quiz_id}/import-csv")
async def import_csv(
    quiz_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz:
        raise HTTPException(
            404,
            "Quiz not found"
        )

    if (
        not file.filename
        or not file.filename.lower().endswith(".csv")
    ):
        raise HTTPException(
            400,
            "Upload a CSV file"
        )

    raw = await file.read()

    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(
            400,
            "CSV file must be smaller than 2 MB"
        )

    try:
        reader = csv.DictReader(
            io.StringIO(raw.decode("utf-8-sig"))
        )

        required = {
            "question",
            "option_a",
            "option_b",
            "option_c",
            "option_d",
            "correct_option"
        }

        if not required.issubset(
            set(reader.fieldnames or [])
        ):
            raise ValueError(
                "CSV headers must include: "
                + ", ".join(sorted(required))
            )

        rows = list(reader)

        if not rows:
            raise ValueError(
                "CSV has no question rows"
            )

        if len(rows) > 500:
            raise ValueError(
                "Maximum 500 questions per upload"
            )

        questions = []

        for index, row in enumerate(rows, start=2):
            correct = (
                row.get("correct_option") or ""
            ).strip().upper()

            if correct not in {"A", "B", "C", "D"}:
                raise ValueError(
                    f"Row {index}: correct_option must be A, B, C or D"
                )

            values = {
                key: (row.get(key) or "").strip()
                for key in required - {"correct_option"}
            }

            if not all(values.values()):
                raise ValueError(
                    f"Row {index}: question and all four options are required"
                )

            questions.append(
                Question(
                    quiz_id=quiz_id,
                    question_text=values["question"],
                    option_a=values["option_a"],
                    option_b=values["option_b"],
                    option_c=values["option_c"],
                    option_d=values["option_d"],
                    correct_option=correct,
                    explanation=(
                        row.get("explanation") or ""
                    ).strip()
                )
            )

        db.add_all(questions)
        db.commit()

        return {
            "message": f"Imported {len(questions)} questions",
            "imported": len(questions)
        }

    except (UnicodeDecodeError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            400,
            detail=str(exc)
        )


# ---------------------------------------------------------
# ASSESSMENT MANAGEMENT
# ---------------------------------------------------------

@router.post("/assessments", status_code=201)
def create_assessment(
    data: AssessmentIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if data.assessment_type not in {"quiz", "document"}:
        raise HTTPException(
            400,
            "Invalid assessment type"
        )

    try:
        assessment_data = data.model_dump()

        assessment_data["starts_at"] = _to_utc_naive(
            assessment_data.get("starts_at")
        )

        assessment_data["deadline_at"] = _to_utc_naive(
            assessment_data.get("deadline_at")
        )

    except (ValueError, TypeError):
        raise HTTPException(
            400,
            "Invalid date format. Please select a valid date and time."
        )

    starts_at = assessment_data["starts_at"]
    deadline_at = assessment_data["deadline_at"]

    if (
        starts_at
        and deadline_at
        and deadline_at <= starts_at
    ):
        raise HTTPException(
            400,
            "Deadline must be later than the start date"
        )

    if deadline_at and deadline_at <= datetime.utcnow():
        raise HTTPException(
            400,
            "Deadline must be in the future"
        )

    if data.assessment_type == "quiz":
        if not data.quiz_id:
            raise HTTPException(
                400,
                "Quiz ID is required"
            )

        quiz = db.get(Quiz, data.quiz_id)

        if not quiz or not quiz.is_active:
            raise HTTPException(
                404,
                "Active quiz not found"
            )

    elif data.quiz_id is not None:
        raise HTTPException(
            400,
            "Document assessments must not have a quiz ID"
        )

    assessment = Assessment(
        **assessment_data,
        created_by=admin.id,
        status="draft"
    )

    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    return {
        "id": assessment.id,
        "title": assessment.title,
        "status": assessment.status,
        "starts_at": (
            assessment.starts_at.isoformat()
            if assessment.starts_at else None
        ),
        "deadline_at": (
            assessment.deadline_at.isoformat()
            if assessment.deadline_at else None
        ),
        "message": "Assessment created successfully"
    }


@router.patch("/assessments/{assessment_id}")
def update_assessment(
    assessment_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    if assessment.status == "closed":
        raise HTTPException(
            400,
            "Closed assessment cannot be edited"
        )

    allowed_fields = {
        "title",
        "description",
        "starts_at",
        "deadline_at",
        "max_marks"
    }

    unknown_fields = set(data.keys()) - allowed_fields

    if unknown_fields:
        raise HTTPException(
            400,
            f"Invalid fields: {', '.join(sorted(unknown_fields))}"
        )

    if not data:
        raise HTTPException(
            400,
            "No update data provided"
        )

    if "title" in data:
        title = str(data["title"]).strip()

        if len(title) < 3 or len(title) > 180:
            raise HTTPException(
                400,
                "Title must contain 3-180 characters"
            )

        assessment.title = title

    if "description" in data:
        assessment.description = str(data["description"])

    if "max_marks" in data:
        marks = data["max_marks"]

        if (
            not isinstance(marks, (int, float))
            or isinstance(marks, bool)
            or marks <= 0
        ):
            raise HTTPException(
                400,
                "Maximum marks must be greater than zero"
            )

        assessment.max_marks = marks

    try:
        new_start = assessment.starts_at
        new_deadline = assessment.deadline_at

        if "starts_at" in data:
            new_start = _to_utc_naive(
                data["starts_at"]
            )

        if "deadline_at" in data:
            new_deadline = _to_utc_naive(
                data["deadline_at"]
            )

    except (ValueError, TypeError):
        raise HTTPException(
            400,
            "Invalid date format. Please select a valid date and time."
        )

    if (
        new_start
        and new_deadline
        and new_start >= new_deadline
    ):
        raise HTTPException(
            400,
            "Deadline must be later than start time"
        )

    if new_deadline and new_deadline <= datetime.utcnow():
        raise HTTPException(
            400,
            "Deadline must be in the future"
        )

    assessment.starts_at = new_start
    assessment.deadline_at = new_deadline

    try:
        db.commit()
        db.refresh(assessment)

    except Exception:
        db.rollback()
        raise HTTPException(
            500,
            "Could not update assessment"
        )

    return {
        "message": "Assessment updated successfully",
        "assessment_id": assessment.id,
        "title": assessment.title,
        "starts_at": (
            assessment.starts_at.isoformat()
            if assessment.starts_at else None
        ),
        "deadline_at": (
            assessment.deadline_at.isoformat()
            if assessment.deadline_at else None
        ),
        "status": assessment.status
    }


@router.get("/assessments")
def list_assessments(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessments = db.query(Assessment).order_by(
        Assessment.id.desc()
    ).all()

    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "assessment_type": a.assessment_type,
            "quiz_id": a.quiz_id,
            "starts_at": (
                a.starts_at.isoformat()
                if a.starts_at else None
            ),
            "deadline_at": (
                a.deadline_at.isoformat()
                if a.deadline_at else None
            ),
            "max_marks": a.max_marks,
            "status": a.status,
            "assigned_employees": len(a.assignments)
        }
        for a in assessments
    ]


@router.patch("/assessments/{assessment_id}/publish")
def publish_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    if assessment.status == "closed":
        raise HTTPException(
            400,
            "Closed assessment cannot be published"
        )

    if not assessment.assignments:
        raise HTTPException(
            400,
            "Assign employees before publishing"
        )

    assessment.status = "published"
    db.commit()

    return {
        "message": "Assessment published successfully"
    }


@router.patch("/assessments/{assessment_id}/close")
def close_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    assessment.status = "closed"
    db.commit()

    return {
        "message": "Assessment closed successfully"
    }


@router.delete("/assessments/{assessment_id}")
def delete_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    db.delete(assessment)
    db.commit()

    return {
        "message": "Assessment deleted successfully"
    }


# ---------------------------------------------------------
# EMPLOYEE ASSIGNMENTS
# ---------------------------------------------------------

@router.post("/assessments/{assessment_id}/assign")
def assign_employees(
    assessment_id: int,
    data: AssignmentIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    if assessment.status != "draft":
        raise HTTPException(
            400,
            "Only draft assessments can be assigned"
        )

    if len(set(data.employee_ids)) != len(data.employee_ids):
        raise HTTPException(
            400,
            "Duplicate employee IDs"
        )

    employees = db.query(User).filter(
        User.id.in_(data.employee_ids),
        User.role == "employee",
        User.is_active == True
    ).all()

    if len(employees) != len(data.employee_ids):
        raise HTTPException(
            400,
            "One or more employee IDs are invalid or inactive"
        )

    existing_ids = {
        a.user_id
        for a in db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id == assessment_id
        ).all()
    }

    added = 0

    for employee in employees:
        if employee.id not in existing_ids:
            db.add(
                AssessmentAssignment(
                    assessment_id=assessment_id,
                    user_id=employee.id
                )
            )
            added += 1

    db.commit()

    return {
        "message": f"Assigned assessment to {added} new employees",
        "assigned": added
    }


@router.get("/assessments/{assessment_id}/assignments")
def get_assignments(
    assessment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    assessment = db.get(
        Assessment,
        assessment_id
    )

    if not assessment:
        raise HTTPException(
            404,
            "Assessment not found"
        )

    return [
        {
            "assignment_id": a.id,
            "employee_id": a.employee.id,
            "employee_name": a.employee.name,
            "employee_email": a.employee.email,
            "status": a.status,
            "assigned_at": (
                a.assigned_at.isoformat()
                if a.assigned_at else None
            )
        }
        for a in assessment.assignments
    ]


# ---------------------------------------------------------
# DOCUMENT SUBMISSIONS
# ---------------------------------------------------------

@router.get("/submissions")
def list_submissions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    submissions = db.query(
        DocumentSubmission
    ).order_by(
        DocumentSubmission.submitted_at.desc()
    ).all()

    results = []

    for s in submissions:
        stored_path = Path(s.stored_path).resolve()

        results.append({
            "id": s.id,
            "file_name": s.file_name,
            "content_type": s.content_type,
            "assignment_id": s.assignment_id,
            "employee_name": s.assignment.employee.name,
            "employee_email": s.assignment.employee.email,
            "assessment_title": s.assignment.assessment.title,
            "submitted_at": (
                s.submitted_at.isoformat()
                if s.submitted_at else None
            ),
            "marks_obtained": s.marks_obtained,
            "max_marks": s.assignment.assessment.max_marks,
            "feedback": s.feedback,
            "status": s.assignment.status,

            # Frontend uses this URL to request the document.
            "file_url": (
                f"/api/admin/submissions/{s.id}/file"
            ),

            # Indicates whether the physical file still exists.
            "file_available": stored_path.is_file()
        })

    return results


# ---------------------------------------------------------
# VIEW / DOWNLOAD SUBMITTED DOCUMENT
# ---------------------------------------------------------

@router.get("/submissions/{submission_id}/file")
def view_submission_file(
    submission_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    submission = db.get(
        DocumentSubmission,
        submission_id
    )

    if not submission:
        raise HTTPException(
            404,
            "Submission not found"
        )

    # This must match the UPLOAD_DIR used in assessments.py.
    upload_dir = (
        Path(__file__).resolve().parents[2]
        / "uploads"
        / "submissions"
    ).resolve()

    file_path = Path(
        submission.stored_path
    ).resolve()

    # Prevent a database path from accessing files outside
    # the submissions folder.
    try:
        file_path.relative_to(upload_dir)

    except ValueError:
        raise HTTPException(
            403,
            "Access to this file is not allowed"
        )

    if not file_path.is_file():
        raise HTTPException(
            404,
            "Uploaded document is missing"
        )

    extension = file_path.suffix.lower()

    if extension == ".pdf":
        media_type = "application/pdf"
        disposition = "inline"

    elif extension == ".docx":
        media_type = (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        )
        disposition = "attachment"

    else:
        raise HTTPException(
            400,
            "Unsupported document type"
        )

    safe_name = Path(
        submission.file_name
    ).name.replace('"', "")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'{disposition}; filename="{safe_name}"'
            )
        }
    )


# ---------------------------------------------------------
# EVALUATE DOCUMENT SUBMISSION
# ---------------------------------------------------------

@router.patch("/submissions/{submission_id}/evaluate")
def evaluate_submission(
    submission_id: int,
    data: EvaluationIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    submission = db.get(
        DocumentSubmission,
        submission_id
    )

    if not submission:
        raise HTTPException(
            404,
            "Submission not found"
        )

    max_marks = submission.assignment.assessment.max_marks

    if data.marks_obtained > max_marks:
        raise HTTPException(
            400,
            f"Marks cannot exceed {max_marks}"
        )

    if data.marks_obtained < 0:
        raise HTTPException(
            400,
            "Marks cannot be negative"
        )

    submission.marks_obtained = data.marks_obtained
    submission.feedback = data.feedback
    submission.evaluated_by = admin.id
    submission.evaluated_at = datetime.utcnow()

    submission.assignment.status = "evaluated"

    db.commit()

    return {
        "message": "Submission evaluated successfully",
        "marks_obtained": submission.marks_obtained,
        "max_marks": max_marks,
        "feedback": submission.feedback
    }


# ---------------------------------------------------------
# EMPLOYEE PERFORMANCE REPORTS
# ---------------------------------------------------------

@router.get("/performance")
def performance(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    employees = db.query(User).filter(
        User.role == "employee"
    ).order_by(
        User.name
    ).all()

    results = []

    for employee in employees:
        attempts = db.query(Attempt).filter(
            Attempt.user_id == employee.id
        ).all()

        assignments = db.query(
            AssessmentAssignment
        ).filter(
            AssessmentAssignment.user_id == employee.id
        ).all()

        percentages = [
            a.percentage for a in attempts
        ]

        results.append({
            "employee_id": employee.id,
            "name": employee.name,
            "email": employee.email,
            "is_active": employee.is_active,
            "total_attempts": len(attempts),

            "average_score": round(
                sum(percentages) / len(percentages),
                2
            ) if percentages else 0,

            "assigned_assessments": len(assignments),

            "completed_assessments": sum(
                1 for a in assignments
                if a.status in {"submitted", "evaluated"}
            ),

            "pending_assessments": sum(
                1 for a in assignments
                if a.status == "pending"
            )
        })

    return results


# ---------------------------------------------------------
# ALL QUIZ ATTEMPTS
# ---------------------------------------------------------

@router.get("/attempts")
def all_attempts(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    attempts = db.query(Attempt).order_by(
        Attempt.submitted_at.desc()
    ).all()

    return [
        {
            "attempt_id": a.id,
            "employee_id": a.user_id,
            "employee_name": a.user.name,
            "employee_email": a.user.email,
            "quiz_id": a.quiz_id,
            "quiz_title": a.quiz.title,
            "score": a.score,
            "total_questions": a.total_questions,
            "percentage": a.percentage,
            "submitted_at": (
                a.submitted_at.isoformat()
                if a.submitted_at else None
            )
        }
        for a in attempts
    ]


# ---------------------------------------------------------
# VIEW QUESTIONS IN A QUIZ
# ---------------------------------------------------------

@router.get("/quizzes/{quiz_id}/questions")
def list_quiz_questions(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz:
        raise HTTPException(404, "Quiz not found")

    return [
        {
            "id": q.id,
            "quiz_id": q.quiz_id,
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_option": q.correct_option,
            "explanation": q.explanation
        }
        for q in quiz.questions
    ]


# ---------------------------------------------------------
# EDIT A QUESTION
# ---------------------------------------------------------

@router.patch("/questions/{question_id}")
def update_question(
    question_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    question = db.get(Question, question_id)

    if not question:
        raise HTTPException(404, "Question not found")

    allowed_fields = {
        "question_text",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_option",
        "explanation"
    }

    if not data or set(data.keys()) - allowed_fields:
        raise HTTPException(400, "Invalid question update fields")

    for field in allowed_fields:
        if field in data:
            value = data[field]

            if field == "correct_option":
                value = str(value).strip().upper()
                if value not in {"A", "B", "C", "D"}:
                    raise HTTPException(
                        400,
                        "Correct option must be A, B, C or D"
                    )
            elif field != "explanation":
                value = str(value).strip()
                if not value:
                    raise HTTPException(
                        400,
                        f"{field} cannot be empty"
                    )
            else:
                value = str(value or "")

            setattr(question, field, value)

    db.commit()
    db.refresh(question)

    return {
        "message": "Question updated successfully",
        "id": question.id
    }


# ---------------------------------------------------------
# DELETE A QUESTION
# ---------------------------------------------------------

@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    question = db.get(Question, question_id)

    if not question:
        raise HTTPException(404, "Question not found")

    db.delete(question)
    db.commit()

    return {
        "message": "Question deleted successfully"
    }

