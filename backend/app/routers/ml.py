from pathlib import Path
import joblib
import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from backend.app.security import get_current_user
from backend.app.models import User

router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])
MODEL_PATH = Path(__file__).resolve().parents[3] / "ML" / "models" / "performance_model.joblib"

class PredictionIn(BaseModel):
    average_score: float = Field(ge=0, le=100)
    completed_assessments: int = Field(ge=0, le=10000)
    average_completion_rate: float = Field(ge=0, le=100)

@router.post("/predict")
def predict(data: PredictionIn, user: User = Depends(get_current_user)):
    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        result = int(model.predict(np.array([[data.average_score, data.completed_assessments,
                                               data.average_completion_rate]]))[0])
        return {"prediction": "High" if result == 1 else "Needs Support",
                "source": "trained_demo_model",
                "notice": "Educational estimate only; not suitable for employment decisions."}
    # Transparent non-ML fallback, clearly labeled.
    estimate = "High" if data.average_score >= 75 and data.average_completion_rate >= 70 else "Needs Support"
    return {"prediction": estimate, "source": "simple_demo_baseline",
            "notice": "Train the demo model to enable Random Forest. This estimate is not a validated employment measure."}
