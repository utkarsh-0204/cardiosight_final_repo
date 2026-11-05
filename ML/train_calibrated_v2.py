import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

print("="*70)
print("TRAINING PLATT-CALIBRATED FRAMINGHAM V2 CANDIDATE")
print("="*70)

# 1. Load Framingham dataset
df = pd.read_csv("ML/framingham.csv")
X = df.drop("TenYearCHD", axis=1)
y = df["TenYearCHD"]

feature_names = list(X.columns)
print(f"Features ({len(feature_names)}): {feature_names}")

# 2. Recreate strict 80/20 train/test split (NEVER FIT ON TEST SET)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
print(f"Training set: {len(X_train)} samples")
print(f"Untouched test set: {len(X_test)} samples")

# 3. Base Pipeline matching production hyperparameters
base_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("classifier", RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    ))
])

# 4. Platt Calibrated Classifier via Nested 5-Fold Cross-Validation on Training Set ONLY
print("Fitting CalibratedClassifierCV(method='sigmoid', cv=5) on X_train...")
calibrated_pipeline = CalibratedClassifierCV(
    estimator=base_pipeline,
    method="sigmoid",
    cv=5
)
calibrated_pipeline.fit(X_train, y_train)

# 5. Evaluate on untouched test set
y_prob_test = calibrated_pipeline.predict_proba(X_test)[:, 1]
brier = brier_score_loss(y_test, y_prob_test)
ll = log_loss(y_test, y_prob_test)
auc = roc_auc_score(y_test, y_prob_test)

print(f"\nUntouched Test Set Evaluation:")
print(f"  Brier Score: {brier:.4f} (Benchmark Production: 0.1711)")
print(f"  Log Loss:    {ll:.4f} (Benchmark Production: 0.5177)")
print(f"  ROC-AUC:     {auc:.4f} (Benchmark Production: 0.6493)")

# 6. Save separate artifact model_calibrated.joblib
artifact_path = Path("ML/mlapp/model_artifacts/model_calibrated.joblib")
artifact_path.parent.mkdir(parents=True, exist_ok=True)

artifact_payload = {
    "model": calibrated_pipeline,
    "feature_names": feature_names,
    "version": "v2_platt_calibrated",
    "methodology": "Nested 5-Fold Cross-Validation Platt Scaling on 80% Training Partition",
    "brier_test": float(brier),
    "log_loss_test": float(ll),
    "roc_auc_test": float(auc)
}

joblib.dump(artifact_payload, artifact_path)
print(f"\nSaved Platt-calibrated V2 artifact to: {artifact_path}")
print("Existing production artifact (model.joblib) preserved intact.")
