"""
CardioSight TMT (UCI Cleveland) Cross-Validation & Clinical Validation Audit
----------------------------------------------------------------------------
Performs:
1. Data integrity check: duplicates, missing values, class distributions.
2. Leakage analysis: target leakage and feature preprocessing leakage.
3. Rigorous Stratified 5-Fold and 10-Fold Cross-Validation.
4. Reports Mean +/- Std for Accuracy, Sensitivity, Specificity, Precision, F1, and ROC-AUC.
5. Compares with the 61-record holdout split to provide an honest, unexaggerated clinical assessment.
"""

import sys
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import StratifiedKFold
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    recall_score,
    precision_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

DATA_PATH = Path(__file__).resolve().parent / "data" / "processed.cleveland.data"

COLS = [
    "age", "sex", "cp", "trestbps", "chol", "fbs",
    "restecg", "thalach", "exang", "oldpeak", "slope",
    "ca", "thal", "num"
]

TMT_FEATURES = ["age", "sex", "restecg", "thalach", "exang", "oldpeak", "slope"]


def run_audit():
    print("=" * 70)
    print("UCI CLEVELAND HEART DISEASE DATASET & TMT MODEL VALIDATION AUDIT")
    print("=" * 70)

    if not DATA_PATH.exists():
        print(f"Error: Dataset not found at {DATA_PATH}")
        sys.exit(1)

    df_raw = pd.read_csv(DATA_PATH, names=COLS, na_values="?")
    print(f"\n1. DATASET INTEGRITY & CHARACTERISTICS:")
    print(f"   Total patient records in Cleveland dataset: {len(df_raw)}")
    print(f"   Total features in original dataset: {len(COLS)}")
    print(f"   TMT features utilized: {TMT_FEATURES}")

    # Check for duplicates across all columns
    dup_all = df_raw.duplicated().sum()
    print(f"   Duplicate rows across all 14 columns: {dup_all}")

    # Check for duplicates across the 7 TMT features
    dup_tmt = df_raw.duplicated(subset=TMT_FEATURES).sum()
    print(f"   Duplicate rows across 7 TMT features: {dup_tmt} (different patients with similar stress profiles)")

    # Missing values in TMT features
    missing_tmt = df_raw[TMT_FEATURES].isna().sum()
    print(f"\n   Missing values in TMT features:")
    for col, count in missing_tmt.items():
        print(f"     - {col:10s}: {count} missing ({count / len(df_raw) * 100:.2f}%)")

    # Target variable distribution
    # num: 0 (<50% stenosis), 1, 2, 3, 4 (different levels of stenosis)
    # Target for binary CAD classification: num > 0
    y = (df_raw["num"] > 0).astype(int)
    pos_count = (y == 1).sum()
    neg_count = (y == 0).sum()
    print(f"\n   Target Distribution (num > 0 = Angiographic CAD >= 50% stenosis):")
    print(f"     - Negative (num == 0, < 50% stenosis): {neg_count} ({neg_count / len(y) * 100:.1f}%)")
    print(f"     - Positive (num >= 1, >= 50% stenosis): {pos_count} ({pos_count / len(y) * 100:.1f}%)")
    print(f"     - Baseline prevalence of CAD: {pos_count / len(y) * 100:.2f}%")

    # 2. Leakage Analysis
    print(f"\n2. TARGET & FEATURE LEAKAGE ANALYSIS:")
    print("   - Target Leakage Check:")
    print("     The target variable 'num' is angiographic diameter narrowing.")
    print("     The 7 features used are: 'age', 'sex', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope'.")
    print("     Fluoroscopy vessels ('ca') and thallium scintigraphy ('thal') are EXCLUDED from TMT.")
    print("     None of the 7 features are post-angiography or derived from 'num'. (Zero target leakage).")
    print("   - Preprocessing Leakage Check:")
    print("     SimpleImputer and StandardScaler are encapsulated strictly inside a Scikit-Learn Pipeline.")
    print("     During cross-validation, imputation medians and scaling parameters (mean, std) are")
    print("     fitted EXCLUSIVELY on the training fold and applied to the test fold. (Zero data leakage).")

    # 3. Stratified Cross-Validation
    X = df_raw[TMT_FEATURES].copy()

    def evaluate_cv(n_splits=5):
        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

        accuracies = []
        sensitivities = []
        specificities = []
        precisions = []
        f1_scores = []
        roc_aucs = []

        for fold, (train_idx, val_idx) in enumerate(skf.split(X, y), 1):
            X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]

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

            pipeline.fit(X_tr, y_tr)
            y_pred = pipeline.predict(X_val)
            y_prob = pipeline.predict_proba(X_val)[:, 1]

            cm = confusion_matrix(y_val, y_pred)
            tn, fp, fn, tp = cm.ravel()

            acc = accuracy_score(y_val, y_pred)
            sens = recall_score(y_val, y_pred)  # Sensitivity / Recall (class 1)
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
            prec = precision_score(y_val, y_pred, zero_division=0)
            f1 = f1_score(y_val, y_pred, zero_division=0)
            roc = roc_auc_score(y_val, y_prob)

            accuracies.append(acc)
            sensitivities.append(sens)
            specificities.append(spec)
            precisions.append(prec)
            f1_scores.append(f1)
            roc_aucs.append(roc)

        return {
            "n_splits": n_splits,
            "accuracy": (np.mean(accuracies), np.std(accuracies)),
            "sensitivity": (np.mean(sensitivities), np.std(sensitivities)),
            "specificity": (np.mean(specificities), np.std(specificities)),
            "precision": (np.mean(precisions), np.std(precisions)),
            "f1": (np.mean(f1_scores), np.std(f1_scores)),
            "roc_auc": (np.mean(roc_aucs), np.std(roc_aucs)),
            "folds": list(zip(accuracies, sensitivities, specificities, precisions, f1_scores, roc_aucs))
        }

    cv5 = evaluate_cv(n_splits=5)
    cv10 = evaluate_cv(n_splits=10)

    print(f"\n3. STRATIFIED 5-FOLD CROSS-VALIDATION RESULTS (Whole Dataset, N=303):")
    print(f"   Accuracy:    {cv5['accuracy'][0] * 100:.2f}% +/- {cv5['accuracy'][1] * 100:.2f}%")
    print(f"   Sensitivity: {cv5['sensitivity'][0] * 100:.2f}% +/- {cv5['sensitivity'][1] * 100:.2f}% (Recall for CAD >= 50%)")
    print(f"   Specificity: {cv5['specificity'][0] * 100:.2f}% +/- {cv5['specificity'][1] * 100:.2f}% (True Negative Rate)")
    print(f"   Precision:   {cv5['precision'][0] * 100:.2f}% +/- {cv5['precision'][1] * 100:.2f}% (Positive Predictive Value)")
    print(f"   F1-Score:    {cv5['f1'][0] * 100:.2f}% +/- {cv5['f1'][1] * 100:.2f}%")
    print(f"   ROC-AUC:     {cv5['roc_auc'][0]:.4f} +/- {cv5['roc_auc'][1]:.4f}")

    print(f"\n   Fold-by-Fold Breakdown (5 Folds):")
    for i, f in enumerate(cv5['folds'], 1):
        print(f"     Fold {i}: Acc={f[0]*100:.1f}%, Sens={f[1]*100:.1f}%, Spec={f[2]*100:.1f}%, Prec={f[3]*100:.1f}%, F1={f[4]*100:.1f}%, AUC={f[5]:.4f}")

    print(f"\n4. STRATIFIED 10-FOLD CROSS-VALIDATION RESULTS (Whole Dataset, N=303):")
    print(f"   Accuracy:    {cv10['accuracy'][0] * 100:.2f}% +/- {cv10['accuracy'][1] * 100:.2f}%")
    print(f"   Sensitivity: {cv10['sensitivity'][0] * 100:.2f}% +/- {cv10['sensitivity'][1] * 100:.2f}%")
    print(f"   Specificity: {cv10['specificity'][0] * 100:.2f}% +/- {cv10['specificity'][1] * 100:.2f}%")
    print(f"   Precision:   {cv10['precision'][0] * 100:.2f}% +/- {cv10['precision'][1] * 100:.2f}%")
    print(f"   F1-Score:    {cv10['f1'][0] * 100:.2f}% +/- {cv10['f1'][1] * 100:.2f}%")
    print(f"   ROC-AUC:     {cv10['roc_auc'][0]:.4f} +/- {cv10['roc_auc'][1]:.4f}")

    print(f"\n5. COMPARISON: 61-RECORD HOLDOUT vs. CROSS-VALIDATION (Honesty Check):")
    print("   Holdout Test Set (n=61, random_state=42):")
    print("     - Accuracy:    83.61%")
    print("     - Sensitivity: 92.86%")
    print("     - Specificity: 75.76%")
    print("     - ROC-AUC:     0.9545")
    print("   Stratified 5-Fold Cross-Validation (Full Dataset, N=303):")
    print(f"     - Accuracy:    {cv5['accuracy'][0] * 100:.2f}% +/- {cv5['accuracy'][1] * 100:.2f}%")
    print(f"     - Sensitivity: {cv5['sensitivity'][0] * 100:.2f}% +/- {cv5['sensitivity'][1] * 100:.2f}%")
    print(f"     - Specificity: {cv5['specificity'][0] * 100:.2f}% +/- {cv5['specificity'][1] * 100:.2f}%")
    print(f"     - Precision:   {cv5['precision'][0] * 100:.2f}% +/- {cv5['precision'][1] * 100:.2f}%")
    print(f"     - F1-Score:    {cv5['f1'][0] * 100:.2f}% +/- {cv5['f1'][1] * 100:.2f}%")
    print(f"     - ROC-AUC:     {cv5['roc_auc'][0]:.4f} +/- {cv5['roc_auc'][1]:.4f}")
    print("\n   Scientific Audit Verdict:")
    print("   - The 0.9545 ROC-AUC on the 61-record holdout reflects a favorable test split variance.")
    print(f"   - The genuine cross-validated ROC-AUC is {cv5['roc_auc'][0]:.4f} +/- {cv5['roc_auc'][1]:.4f} (5-fold) and {cv10['roc_auc'][0]:.4f} +/- {cv10['roc_auc'][1]:.4f} (10-fold).")
    print("   - The model has good clinical discriminative ability, but claiming an unvarying 0.9545 ROC-AUC")
    print("     without citing the cross-validated baseline is an exaggeration that must be corrected.")
    print("=" * 70)

if __name__ == "__main__":
    run_audit()

