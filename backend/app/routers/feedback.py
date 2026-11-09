
import httpx

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.security import get_current_user
from backend.app.models import (
    User,
    AIReport,
    Attempt,
    Quiz,
    DocumentSubmission,
)


router = APIRouter(
    prefix="/api/feedback",
    tags=["AI Feedback"]
)


# =========================================================
# REQUEST SCHEMA
# =========================================================

class FeedbackIn(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=1)


# =========================================================
# GROQ AI FEEDBACK GENERATOR
# =========================================================

async def generate_groq_feedback(prompt: str) -> str:

    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Groq API key is missing. "
                "Please configure GROQ_API_KEY in your .env file."
            )
        )

    try:
        async with httpx.AsyncClient(timeout=60) as client:

            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",

                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json"
                },

                json={
                    "model": "openai/gpt-oss-120b",

                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are an expert educational AI assistant "
                                "who provides supportive, personalized and "
                                "actionable employee learning feedback."
                            )
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],

                    "temperature": 0.5,
                    "max_completion_tokens": 700,
                    "reasoning_effort": "low"
                }
            )

            response.raise_for_status()

            result = response.json()

            feedback = (
                result.get("choices", [{}])[0]
                .get("message", {})
                .get("content")
            )

            if not feedback or not feedback.strip():
                raise HTTPException(
                    status_code=502,
                    detail="Groq returned an empty feedback response."
                )

            return feedback.strip()

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Groq API error ({exc.response.status_code}): "
                f"{exc.response.text[:500]}"
            )
        )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Groq API: {str(exc)}"
        )

    except HTTPException:
        raise

    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Groq returned an unexpected feedback response."
        )


# =========================================================
# REPORT RESPONSE HELPER
# =========================================================

def report_to_dict(report: AIReport):

    return {
        "id": report.id,
        "report_id": report.id,
        "user_id": report.user_id,
        "assignment_id": report.assignment_id,
        "attempt_id": report.attempt_id,
        "submission_id": report.submission_id,
        "report_type": report.report_type,
        "title": report.title,
        "feedback": report.feedback,
        "score": report.score,
        "total": report.total,
        "percentage": report.percentage,
        "created_at": report.created_at.isoformat()
        if report.created_at else None
    }


# =========================================================
# QUIZ FEEDBACK PROMPT
# =========================================================

def build_quiz_prompt(
    title: str,
    score: float,
    total: float,
    percentage: float
):

    return f"""
You are a supportive AI learning assistant for an employee
assessment platform.

Assessment title: {title}

Employee quiz performance:
Score: {score}/{total}
Percentage: {percentage:.2f}%

Generate personalized learning feedback based on this result.

Include these sections:

1. Performance Summary
Explain the employee's performance using the score.

2. Strengths
Mention positive learning strengths supported by the result.

3. Areas to Improve
Identify areas that need more practice.
Do not invent specific question topics that were not provided.

4. Learning Recommendations
Give three practical suggestions for improving knowledge.

5. Next Learning Goal
Suggest one achievable goal for the next assessment.

6. Encouragement
End with a short motivating message.

Keep the feedback friendly, concise, professional and actionable.

Use clear headings and bullet points.
Do not make employment decisions or judgments.
"""


# =========================================================
# DOCUMENT FEEDBACK PROMPT
# =========================================================

def build_document_prompt(
    title: str,
    file_name: str,
    score: float,
    total: float,
    evaluator_feedback: str
):

    percentage = round((score / total) * 100, 2) if total else 0

    return f"""
You are a supportive AI learning assistant for an employee
assessment platform.

The employee submitted a document for evaluation.

Assessment title: {title}
Submitted file: {file_name}

Evaluation result:
Marks obtained: {score}/{total}
Percentage: {percentage}%

Evaluator comments:
{evaluator_feedback or "No additional evaluator comments were provided."}

Create personalized learning feedback using the evaluation result
and the evaluator comments.

Include these sections:

1. Performance Summary
Explain the result and the overall performance.

2. Strengths
Identify strengths supported by the evaluator comments.

3. Areas to Improve
Explain what the employee should improve based on the
available evaluation information.

4. Learning Recommendations
Give three practical and relevant suggestions.

5. Next Learning Goal
Suggest one achievable goal for the next submission.

6. Encouragement
End with a motivating message.

Important:
- Do not invent document content.
- Do not claim to have read the submitted file.
- Use only the marks and evaluator comments provided.
- Keep the feedback friendly, professional and actionable.
- Do not make employment decisions or judgments.
- Use clear headings and bullet points.
"""


# =========================================================
# GENERATE AND SAVE QUIZ REPORT
# =========================================================

@router.post("/generate/quiz/{attempt_id}")
async def generate_quiz_report(
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.user_id == user.id
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Quiz attempt not found."
        )

    # Return an existing report instead of generating another.
    existing_report = (
        db.query(AIReport)
        .filter(
            AIReport.attempt_id == attempt.id,
            AIReport.user_id == user.id
        )
        .first()
    )

    if existing_report:
        return {
            "message": "Existing quiz feedback retrieved.",
            "saved": True,
            "report": report_to_dict(existing_report)
        }

    quiz = (
        db.query(Quiz)
        .filter(Quiz.id == attempt.quiz_id)
        .first()
    )

    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found."
        )

    score = float(attempt.score or 0)
    total = float(attempt.total_questions or 0)

    if total <= 0:
        raise HTTPException(
            status_code=400,
            detail="This quiz attempt has no valid questions."
        )

    percentage = round((score / total) * 100, 2)

    prompt = build_quiz_prompt(
        title=quiz.title,
        score=score,
        total=total,
        percentage=percentage
    )

    feedback = await generate_groq_feedback(prompt)

    report = AIReport(
        user_id=user.id,
        attempt_id=attempt.id,
        report_type="quiz",
        title=quiz.title,
        feedback=feedback,
        score=score,
        total=total,
        percentage=percentage
    )

    try:
        db.add(report)
        db.commit()
        db.refresh(report)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the quiz feedback report."
        )

    return {
        "message": "Quiz AI feedback generated and saved successfully.",
        "saved": True,
        "report": report_to_dict(report)
    }


# =========================================================
# GENERATE AND SAVE DOCUMENT REPORT
# =========================================================

@router.post("/generate/document/{submission_id}")
async def generate_document_report(
    submission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    submission = (
        db.query(DocumentSubmission)
        .filter(DocumentSubmission.id == submission_id)
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="Document submission not found."
        )

    assignment = submission.assignment

    # Ensure the report belongs to the logged-in employee.
    if not assignment or assignment.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to access this submission."
        )

    # A document must be evaluated before AI feedback is generated.
    if submission.marks_obtained is None:
        raise HTTPException(
            status_code=400,
            detail="Your document has not been evaluated yet."
        )

    # Return previously saved report if available.
    existing_report = (
        db.query(AIReport)
        .filter(
            AIReport.submission_id == submission.id,
            AIReport.user_id == user.id
        )
        .first()
    )

    if existing_report:
        return {
            "message": "Existing document feedback retrieved.",
            "saved": True,
            "report": report_to_dict(existing_report)
        }

    assessment = assignment.assessment

    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment information not found."
        )

    score = float(submission.marks_obtained)
    total = float(assessment.max_marks or 0)

    if total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Assessment maximum marks are invalid."
        )

    percentage = round((score / total) * 100, 2)

    prompt = build_document_prompt(
        title=assessment.title,
        file_name=submission.file_name,
        score=score,
        total=total,
        evaluator_feedback=submission.feedback or ""
    )

    feedback = await generate_groq_feedback(prompt)

    report = AIReport(
        user_id=user.id,
        assignment_id=assignment.id,
        submission_id=submission.id,
        report_type="document",
        title=assessment.title,
        feedback=feedback,
        score=score,
        total=total,
        percentage=percentage
    )

    try:
        db.add(report)
        db.commit()
        db.refresh(report)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the document feedback report."
        )

    return {
        "message": "Document AI feedback generated and saved successfully.",
        "saved": True,
        "report": report_to_dict(report)
    }


# =========================================================
# GET ALL REPORTS FOR LOGGED-IN EMPLOYEE
# =========================================================

@router.get("/reports")
def get_my_feedback_reports(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    reports = (
        db.query(AIReport)
        .filter(AIReport.user_id == user.id)
        .order_by(AIReport.created_at.desc())
        .all()
    )

    return {
        "total": len(reports),
        "reports": [
            report_to_dict(report)
            for report in reports
        ]
    }


# =========================================================
# GET ONE REPORT
# =========================================================

@router.get("/reports/{report_id}")
def get_feedback_report(
    report_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    report = (
        db.query(AIReport)
        .filter(
            AIReport.id == report_id,
            AIReport.user_id == user.id
        )
        .first()
    )

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Feedback report not found."
        )

    return report_to_dict(report)


# =========================================================
# LEGACY ENDPOINT
# Keeps the existing frontend working temporarily.
# New frontend code will use the quiz/document endpoints.
# =========================================================

@router.post("/generate")
async def generate(
    data: FeedbackIn,
    user: User = Depends(get_current_user)
):

    if data.score > data.total:
        raise HTTPException(
            status_code=400,
            detail="Score cannot be greater than total marks."
        )

    percentage = round((data.score / data.total) * 100)

    prompt = f"""
You are a supportive AI learning assistant for an employee
assessment platform.

Employee quiz performance:
Score: {data.score}/{data.total}
Percentage: {percentage}%

Generate personalized learning feedback.

Include these sections:

1. Performance Summary
Explain the employee's quiz performance.

2. Strengths
Mention one positive learning strength.

3. Areas to Improve
Identify two areas that need more practice.
Do not invent specific question topics that were not provided.

4. Learning Recommendations
Give three practical suggestions for improving knowledge.

5. Next Learning Goal
Suggest one achievable goal for the next quiz.

6. Encouragement
End with a short motivating message.

Keep the feedback friendly, concise, professional and actionable.
Do not make employment decisions or judgments.
"""

    feedback = await generate_groq_feedback(prompt)

    return {
        "feedback": feedback,
        "source": "groq",
        "score": data.score,
        "total": data.total,
        "percentage": percentage
    }
