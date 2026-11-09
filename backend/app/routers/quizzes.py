
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Quiz, Attempt, User
from backend.app.security import get_current_user

router = APIRouter(
    prefix="/api/quizzes",
    tags=["Quizzes"]
)


# =========================================================
# CHECK WHETHER THIS EMPLOYEE COMPLETED THIS QUIZ
# =========================================================

def has_completed_quiz(
    db: Session,
    quiz_id: int,
    user_id: int
) -> bool:
    attempt = (
        db.query(Attempt.id)
        .filter(
            Attempt.quiz_id == quiz_id,
            Attempt.user_id == user_id
        )
        .first()
    )

    return attempt is not None


# =========================================================
# GET ALL ACTIVE QUIZZES
# =========================================================

@router.get("")
def list_quizzes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.is_active.is_(True))
        .order_by(Quiz.id.desc())
        .all()
    )

    result = []

    for quiz in quizzes:

        completed = False

        # Completion is checked separately for each employee.
        if user.role == "employee":
            completed = has_completed_quiz(
                db=db,
                quiz_id=quiz.id,
                user_id=user.id
            )

        result.append({
            "id": quiz.id,
            "title": quiz.title,
            "description": quiz.description,
            "duration_minutes": quiz.duration_minutes,
            "question_count": len(quiz.questions),
            "completed": completed
        })

    return result


# =========================================================
# GET QUIZ DETAILS
# =========================================================

@router.get("/{quiz_id}")
def quiz_detail(
    quiz_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    quiz = db.get(Quiz, quiz_id)

    if not quiz or not quiz.is_active:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found"
        )

    # Employees cannot reopen an already completed quiz.
    if user.role == "employee":

        completed = has_completed_quiz(
            db=db,
            quiz_id=quiz.id,
            user_id=user.id
        )

        if completed:
            raise HTTPException(
                status_code=403,
                detail="You have already completed this practice quiz."
            )

    return {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "duration_minutes": quiz.duration_minutes,
        "question_count": len(quiz.questions),
        "questions": [
            {
                "id": question.id,
                "question_text": question.question_text,
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_c": question.option_c,
                "option_d": question.option_d
            }
            for question in quiz.questions
        ]
    }
