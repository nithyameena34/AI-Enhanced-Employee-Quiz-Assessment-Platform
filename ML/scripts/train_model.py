from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "ML" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

def main():
    # Synthetic demo data only. Replace with appropriately consented,
    # representative and validated data before making any real-world claims.
    rng = np.random.default_rng(42)
    n = 1200
    average_score = rng.uniform(20, 100, n)
    completed = rng.integers(0, 20, n)
    completion_rate = rng.uniform(10, 100, n)
    X = np.column_stack([average_score, completed, completion_rate])
    probability = 0.55 * (average_score / 100) + 0.25 * (completion_rate / 100) + 0.20 * (completed / 20)
    y = (probability + rng.normal(0, 0.12, n) >= 0.62).astype(int)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    model = RandomForestClassifier(n_estimators=150, max_depth=7, random_state=42, class_weight="balanced")
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    print("Demo model accuracy:", round(accuracy_score(y_test, pred), 3))
    print(classification_report(y_test, pred))
    output = MODEL_DIR / "performance_model.joblib"
    joblib.dump(model, output)
    print("Saved:", output)

if __name__ == "__main__":
    main()
