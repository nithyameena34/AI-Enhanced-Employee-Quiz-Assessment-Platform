
import math
import uuid
from pathlib import Path
from datetime import datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File
)
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    Quiz,
    Question,
    Attempt,
    User,
    Assessment,
    AssessmentAssignment,
    DocumentSubmission
)
from backend.app.schemas import SubmitIn
from backend.app.security import get_current_user


router = APIRouter(
    prefix="/api/assessments",
    tags=["Assessments"]
)


# =========================================================
# CONFIGURATION
# =========================================================

UPLOAD_DIR = (
    Path(__file__).resolve().parents[2]
    / "uploads"
    / "submissions"
)

MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


# =========================================================
# HELPER FUNCTIONS
# =========================================================

def get_employee_assignment(
    assessment_id: int,
    user: User,
    db: Session
):
    assignment = db.query(AssessmentAssignment).filter(
        AssessmentAssignment.assessment_id == assessment_id,
        AssessmentAssignment.user_id == user.id
    ).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assigned assessment not found"
        )

    return assignment


def check_assessment_available(assessment: Assessment):
    now = datetime.utcnow()

    if assessment.status != "published":
        raise HTTPException(
            status_code=400,
            detail="Assessment is not published"
        )

    if assessment.starts_at and now < assessment.starts_at:
        raise HTTPException(
            status_code=400,
            detail="Assessment has not started yet"
        )

    if assessment.deadline_at and now >= assessment.deadline_at:
        raise HTTPException(
            status_code=400,
            detail="Assessment deadline has passed"
        )


def get_assessment_duration(
    assessment: Assessment,
    db: Session
):
    if assessment.duration_minutes is not None:
        return assessment.duration_minutes

    if assessment.assessment_type == "quiz" and assessment.quiz_id:
        quiz = db.get(Quiz, assessment.quiz_id)

        if quiz:
            return quiz.duration_minutes

    return None


def get_timer_details(
    assignment: AssessmentAssignment,
    db: Session
):
    assessment = assignment.assessment

    duration = get_assessment_duration(assessment, db)

    if not assignment.started_at:
        return {
            "duration_minutes": duration,
            "expires_at": None,
            "remaining_seconds": None,
            "timer_enabled": False
        }

    expires_at = None

    if duration is not None and duration > 0:
        expires_at = (
            assignment.started_at
            + timedelta(minutes=duration)
        )

    if assessment.deadline_at:
        if expires_at is None:
            expires_at = assessment.deadline_at
        else:
            expires_at = min(
                expires_at,
                assessment.deadline_at
            )

    if expires_at is None:
        return {
            "duration_minutes": duration,
            "expires_at": None,
            "remaining_seconds": None,
            "timer_enabled": False
        }

    remaining = max(
        0,
        math.ceil(
            (expires_at - datetime.utcnow()).total_seconds()
        )
    )

    return {
        "duration_minutes": duration,
        "expires_at": expires_at.isoformat(),
        "remaining_seconds": remaining,
        "timer_enabled": True
    }


def enforce_assessment_timer(
    assignment: AssessmentAssignment,
    db: Session
):
    if assignment.status != "in_progress":
        raise HTTPException(
            status_code=400,
            detail="Start the assessment before continuing"
        )

    if not assignment.started_at:
        raise HTTPException(
            status_code=400,
            detail="Assessment start time is missing"
        )

    timer = get_timer_details(assignment, db)

    if (
        timer["timer_enabled"]
        and timer["remaining_seconds"] <= 0
    ):
        assignment.status = "overdue"
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Assessment time has expired. Submission is no longer allowed."
        )

    return timer


def mark_overdue_if_expired(
    assignment: AssessmentAssignment,
    db: Session
):
    if assignment.status != "in_progress":
        return

    if not assignment.started_at:
        return

    timer = get_timer_details(assignment, db)

    if (
        timer["timer_enabled"]
        and timer["remaining_seconds"] <= 0
    ):
        assignment.status = "overdue"
        db.commit()


def validate_quiz(assessment: Assessment, db: Session):
    if not assessment.quiz_id:
        raise HTTPException(
            status_code=400,
            detail="No quiz is linked to this assessment"
        )

    quiz = db.get(Quiz, assessment.quiz_id)

    if not quiz or not quiz.is_active:
        raise HTTPException(
            status_code=404,
            detail="Quiz is unavailable"
        )

    questions = db.query(Question).filter(
        Question.quiz_id == quiz.id
    ).all()

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="This quiz has no questions"
        )

    return quiz, questions


# =========================================================
# EMPLOYEE: VIEW ASSIGNED ASSESSMENTS
# =========================================================

@router.get("/my-assessments")
def my_assessments(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignments = db.query(AssessmentAssignment).filter(
        AssessmentAssignment.user_id == user.id
    ).order_by(
        AssessmentAssignment.assigned_at.desc()
    ).all()

    results = []

    for assignment in assignments:
        mark_overdue_if_expired(assignment, db)

        assessment = assignment.assessment

        results.append({
            "assignment_id": assignment.id,
            "assessment_id": assessment.id,
            "title": assessment.title,
            "description": assessment.description,
            "assessment_type": assessment.assessment_type,
            "quiz_id": assessment.quiz_id,
            "duration_minutes": get_assessment_duration(
                assessment, db
            ),
            "starts_at": (
                assessment.starts_at.isoformat()
                if assessment.starts_at else None
            ),
            "deadline_at": (
                assessment.deadline_at.isoformat()
                if assessment.deadline_at else None
            ),
            "started_at": (
                assignment.started_at.isoformat()
                if assignment.started_at else None
            ),
            "max_marks": assessment.max_marks,
            "assessment_status": assessment.status,
            "assignment_status": assignment.status
        })

    return results


# =========================================================
# EMPLOYEE: START / RESUME ASSESSMENT
# =========================================================

@router.post("/assigned/{assessment_id}/start")
def start_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignment = get_employee_assignment(
        assessment_id, user, db
    )

    assessment = assignment.assessment

    check_assessment_available(assessment)

    if assignment.status in {
        "submitted",
        "evaluated",
        "overdue"
    }:
        raise HTTPException(
            status_code=400,
            detail="This assessment cannot be started again"
        )

    if assessment.assessment_type not in {
        "quiz",
        "document"
    }:
        raise HTTPException(
            status_code=400,
            detail="Unsupported assessment type"
        )

    if assessment.assessment_type == "quiz":
        validate_quiz(assessment, db)

    if assignment.started_at is None:
        assignment.started_at = datetime.utcnow()
        assignment.status = "in_progress"

        db.commit()
        db.refresh(assignment)
    else:
        assignment.status = "in_progress"

    timer = get_timer_details(assignment, db)

    if (
        timer["timer_enabled"]
        and timer["remaining_seconds"] <= 0
    ):
        assignment.status = "overdue"
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Assessment time has expired"
        )

    if assignment.status != "in_progress":
        assignment.status = "in_progress"
        db.commit()

    return {
        "message": "Assessment started successfully",
        "assessment_id": assessment.id,
        "title": assessment.title,
        "assessment_type": assessment.assessment_type,
        "started_at": assignment.started_at.isoformat(),
        **timer
    }


# =========================================================
# EMPLOYEE: GET MCQ QUESTIONS
# =========================================================

@router.get("/assigned/{assessment_id}/questions")
def get_assessment_questions(
    assessment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignment = get_employee_assignment(
        assessment_id, user, db
    )

    assessment = assignment.assessment

    check_assessment_available(assessment)

    if assessment.assessment_type != "quiz":
        raise HTTPException(
            status_code=400,
            detail="This is a document-based assessment"
        )

    enforce_assessment_timer(assignment, db)

    quiz, questions = validate_quiz(assessment, db)

    return [
        {
            "id": question.id,
            "question_text": question.question_text,
            "option_a": question.option_a,
            "option_b": question.option_b,
            "option_c": question.option_c,
            "option_d": question.option_d
        }
        for question in questions
    ]


# =========================================================
# EMPLOYEE: SUBMIT ASSIGNED MCQ ASSESSMENT
# =========================================================


@router.post("/assigned/{assessment_id}/submit")
def submit_assigned_quiz(
    assessment_id: int,
    data: SubmitIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignment = get_employee_assignment(
        assessment_id, user, db
    )

    assessment = assignment.assessment

    # The assessment must still be published.
    if assessment.status != "published":
        raise HTTPException(
            status_code=400,
            detail="This assessment is no longer available"
        )

    if assessment.assessment_type != "quiz":
        raise HTTPException(
            status_code=400,
            detail="This is not a quiz assessment"
        )

    # Only an employee who started the assessment can submit it.
    if assignment.status != "in_progress":
        raise HTTPException(
            status_code=400,
            detail="This assessment has already been submitted or cannot be submitted"
        )

    if not assignment.started_at:
        raise HTTPException(
            status_code=400,
            detail="Assessment start time is missing"
        )

    quiz, questions = validate_quiz(assessment, db)

    # Determine whether the timer or assessment deadline has expired.
    timer = get_timer_details(assignment, db)

    timer_expired = (
        timer["timer_enabled"]
        and timer["remaining_seconds"] <= 0
    )

    submitted = {
        answer.question_id: answer.selected_option
        for answer in data.answers
    }

    # Reject duplicate answers.
    if len(submitted) != len(data.answers):
        raise HTTPException(
            status_code=400,
            detail="Duplicate question answers were submitted"
        )

    valid_ids = {question.id for question in questions}

    # Reject answers belonging to another quiz.
    if not set(submitted).issubset(valid_ids):
        raise HTTPException(
            status_code=400,
            detail="An answer belongs to another quiz"
        )

    valid_options = {"A", "B", "C", "D"}

    for selected in submitted.values():
        if selected not in valid_options:
            raise HTTPException(
                status_code=400,
                detail="Invalid answer option"
            )

    # If the timer has not expired, require all answers.
    # After expiry, partial answers are accepted for auto-submission.
    if not timer_expired and set(submitted) != valid_ids:
        raise HTTPException(
            status_code=400,
            detail="Answer all questions before submitting"
        )

    # Unanswered questions automatically receive zero marks.
    score = sum(
        1
        for question in questions
        if submitted.get(question.id) == question.correct_option
    )

    total = len(questions)

    percentage = round(
        (score / total) * 100, 2
    )

    marks_obtained = round(
        percentage / 100 * (assessment.max_marks or total), 2
    )

    attempt = Attempt(
        user_id=user.id,
        quiz_id=quiz.id,
        score=score,
        total_questions=total,
        percentage=percentage
    )

    db.add(attempt)

    assignment.status = "submitted"

    try:
        db.commit()
        db.refresh(attempt)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Assessment submission failed"
        )

    return {
        "attempt_id": attempt.id,
        "assessment_id": assessment.id,
        "quiz_title": quiz.title,
        "score": score,
        "total_questions": total,
        "percentage": percentage,
        "marks_obtained": marks_obtained,
        "max_marks": assessment.max_marks,
        "timer_expired": timer_expired,
        "answered_questions": len(submitted),
        "unanswered_questions": total - len(submitted),
        "message": (
            "Time expired. Your answers were submitted automatically."
            if timer_expired
            else "Assessment submitted successfully"
        )
    }

# =========================================================
# EMPLOYEE: UPLOAD PDF / DOCX ANSWERS
# =========================================================

@router.post("/assigned/{assessment_id}/document")
async def upload_document(
    assessment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignment = get_employee_assignment(
        assessment_id, user, db
    )

    assessment = assignment.assessment

    check_assessment_available(assessment)

    if assessment.assessment_type != "document":
        raise HTTPException(
            status_code=400,
            detail="This assessment does not accept documents"
        )

    enforce_assessment_timer(assignment, db)

    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and DOCX files are allowed"
        )

    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Maximum document size is 10 MB"
        )

    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file"
        )

    if extension == ".docx" and not content.startswith(b"PK"):
        raise HTTPException(
            status_code=400,
            detail="Invalid DOCX file"
        )

    existing = db.query(DocumentSubmission).filter(
        DocumentSubmission.assignment_id == assignment.id
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="A document has already been submitted"
        )

    enforce_assessment_timer(assignment, db)

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    stored_name = f"{uuid.uuid4().hex}{extension}"
    stored_path = UPLOAD_DIR / stored_name

    try:
        stored_path.write_bytes(content)

        submission = DocumentSubmission(
            assignment_id=assignment.id,
            file_name=Path(file.filename or "submission").name,
            stored_path=str(stored_path),
            content_type=file.content_type or ""
        )

        db.add(submission)

        assignment.status = "submitted"

        db.commit()
        db.refresh(submission)

    except Exception:
        db.rollback()

        if stored_path.exists():
            stored_path.unlink()

        raise HTTPException(
            status_code=500,
            detail="Document submission failed"
        )

    finally:
        await file.close()

    return {
        "submission_id": submission.id,
        "file_name": submission.file_name,
        "submitted_at": submission.submitted_at.isoformat(),
        "message": "Document submitted successfully"
    }


# =========================================================
# EMPLOYEE: VIEW PREVIOUS MCQ RESULTS
# =========================================================

@router.get("/my-results")
def my_results(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    attempts = db.query(Attempt).filter(
        Attempt.user_id == user.id
    ).order_by(
        Attempt.submitted_at.desc()
    ).all()

    return [
        {
            "attempt_id": attempt.id,
            "quiz_title": attempt.quiz.title,
            "score": attempt.score,
            "total_questions": attempt.total_questions,
            "percentage": attempt.percentage,
            "submitted_at": (
                attempt.submitted_at.isoformat()
                if attempt.submitted_at else None
            )
        }
        for attempt in attempts
    ]


# =========================================================
# EMPLOYEE: VIEW DOCUMENT EVALUATION AND FEEDBACK
# =========================================================

@router.get("/my-submissions")
def my_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    assignments = db.query(AssessmentAssignment).filter(
        AssessmentAssignment.user_id == user.id
    ).all()

    results = []

    for assignment in assignments:
        submission = assignment.document_submission

        if not submission:
            continue

        results.append({
            "submission_id": submission.id,
            "assessment_title": assignment.assessment.title,
            "file_name": submission.file_name,
            "submitted_at": (
                submission.submitted_at.isoformat()
                if submission.submitted_at else None
            ),
            "status": assignment.status,
            "marks_obtained": submission.marks_obtained,
            "max_marks": assignment.assessment.max_marks,
            "feedback": submission.feedback,
            "evaluated_at": (
                submission.evaluated_at.isoformat()
                if submission.evaluated_at else None
            )
        })

    return results


# =========================================================
# EXISTING LEGACY MCQ SUBMISSION API - PRACTICE QUIZZES
# =========================================================

@router.post("/{quiz_id}/submit")
def submit(
    quiz_id: int,
    data: SubmitIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # -----------------------------------------------------
    # 1. Check whether the quiz exists and is active
    # -----------------------------------------------------

    quiz = db.get(Quiz, quiz_id)

    if not quiz or not quiz.is_active:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found"
        )

    # -----------------------------------------------------
    # 2. Prevent an employee from submitting twice
    # -----------------------------------------------------

    if user.role == "employee":

        existing_attempt = db.query(Attempt.id).filter(
            Attempt.quiz_id == quiz_id,
            Attempt.user_id == user.id
        ).first()

        if existing_attempt:
            raise HTTPException(
                status_code=409,
                detail="You have already completed this practice quiz. Retaking it is not allowed."
            )

    # -----------------------------------------------------
    # 3. Get quiz questions
    # -----------------------------------------------------

    questions = db.query(Question).filter(
        Question.quiz_id == quiz_id
    ).all()

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="This quiz has no questions"
        )

    # -----------------------------------------------------
    # 4. Validate submitted answers
    # -----------------------------------------------------

    submitted = {
        answer.question_id: answer.selected_option
        for answer in data.answers
    }

    if len(submitted) != len(data.answers):
        raise HTTPException(
            status_code=400,
            detail="Duplicate question answers were submitted"
        )

    valid_ids = {
        question.id for question in questions
    }

    if not set(submitted).issubset(valid_ids):
        raise HTTPException(
            status_code=400,
            detail="An answer belongs to another quiz"
        )

    valid_options = {"A", "B", "C", "D"}

    for selected in submitted.values():
        if selected not in valid_options:
            raise HTTPException(
                status_code=400,
                detail="Invalid answer option"
            )

    # -----------------------------------------------------
    # 5. Calculate score
    # -----------------------------------------------------

    score = sum(
        1
        for question in questions
        if submitted.get(question.id) == question.correct_option
    )

    total = len(questions)

    percentage = round(
        (score / total) * 100, 2
    )

    # -----------------------------------------------------
    # 6. Save attempt
    # -----------------------------------------------------

    attempt = Attempt(
        user_id=user.id,
        quiz_id=quiz_id,
        score=score,
        total_questions=total,
        percentage=percentage
    )

    try:
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Quiz submission failed"
        )

    # -----------------------------------------------------
    # 7. Return result
    # -----------------------------------------------------

    return {
        "attempt_id": attempt.id,
        "quiz_id": quiz.id,
        "quiz_title": quiz.title,
        "score": score,
        "total_questions": total,
        "percentage": percentage,
        "message": "Practice quiz submitted successfully"
    }
