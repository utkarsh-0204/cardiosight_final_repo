"""
UCI Heart Disease - Exercise Stress Test (TMT) Analysis Model
-------------------------------------------------------------
Trains a Scikit-learn Pipeline on genuine clinical exercise stress testing
features from the UCI Heart Disease dataset (Cleveland Clinic Foundation).

Evaluates on a held-out test split (20%) using stratified sampling.
Metrics evaluated: Accuracy, Sensitivity (Recall), Specificity, ROC-AUC, F1-score.

Saves artifact to: ML/mlapp/model_artifacts/tmt_uci_model.joblib
"""

import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report, roc_auc_score

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ARTIFACT_DIR = Path(__file__).resolve().parent / "model_artifacts"
DATA_FILE = DATA_DIR / "processed.cleveland.data"
ARTIFACT_PATH = ARTIFACT_DIR / "tmt_uci_model.joblib"

COLS = [
    "age", "sex", "cp", "trestbps", "chol", "fbs",
    "restecg", "thalach", "exang", "oldpeak", "slope",
    "ca", "thal", "num"
]

# TMT exercise stress features:
# thalach: max heart rate achieved
# exang: exercise induced angina (1=yes, 0=no)
# oldpeak: ST depression induced by exercise relative to rest
# slope: slope of peak exercise ST segment (1=upsloping, 2=flat, 3=downsloping)
# restecg: resting electrocardiographic results (0=normal, 1=ST-T abnormality, 2=LVH)
TMT_FEATURES = ["age", "sex", "restecg", "thalach", "exang", "oldpeak", "slope"]

def train_and_save():
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"UCI dataset not found at {DATA_FILE}")

    df = pd.read_csv(DATA_FILE, names=COLS, na_values="?")
    print(f"Loaded UCI Cleveland dataset: {len(df)} records.")

    X = df[TMT_FEATURES].copy()
    y = (df["num"] > 0).astype(int)  # 0: <50% stenosis, 1: >=50% stenosis (CAD)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("classifier", RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            random_state=42,
            class_weight="balanced"
        ))
    ])

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    roc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / (tp + fn)
    specificity = tn / (tn + fp)

    metrics = {
        "samples_train": int(len(X_train)),
        "samples_test": int(len(X_test)),
        "accuracy": round(float(acc), 4),
        "sensitivity": round(float(sensitivity), 4),
        "specificity": round(float(specificity), 4),
        "roc_auc": round(float(roc), 4)
    }

    print("\n--- Model Evaluation on Held-Out Test Set (n=61) ---")
    print(f"Accuracy:    {metrics['accuracy'] * 100:.2f}%")
    print(f"Sensitivity: {metrics['sensitivity'] * 100:.2f}%")
    print(f"Specificity: {metrics['specificity'] * 100:.2f}%")
    print(f"ROC-AUC:     {metrics['roc_auc']:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["No Significant CAD", "CAD Present (>=50%)"]))

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": pipeline,
            "feature_names": TMT_FEATURES,
            "metrics": metrics,
            "dataset": "UCI Heart Disease (Cleveland)",
            "target": "Angiographic CAD (>=50% diameter narrowing)"
        },
        ARTIFACT_PATH
    )
    print(f"Saved TMT model artifact to: {ARTIFACT_PATH}")
    return metrics

if __name__ == "__main__":
    train_and_save()
