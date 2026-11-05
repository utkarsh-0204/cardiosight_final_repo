import pandas as pd
import numpy as np
import joblib
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss, log_loss, roc_auc_score,
    accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
)

# ---------------------------------------------------------------------------
# 1. LOAD DATA & LEAKAGE-FREE SPLIT
# ---------------------------------------------------------------------------
df = pd.read_csv("ML/framingham.csv")
X = df.drop("TenYearCHD", axis=1)
y = df["TenYearCHD"]

# Strict holdout: 80% Train/Dev, 20% Test (Exact reproduction of train_framingham.py)
X_train_full, X_test, y_train_full, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

train_prev = y_train_full.mean()
test_prev = y_test.mean()

print(f"Full Dataset: {len(df)} records")
print(f"Development Set (Training Only): {len(X_train_full)} records (Pos: {y_train_full.sum()}, Prev: {train_prev:.4f})")
print(f"Final Test Set (Untouched Holdout): {len(X_test)} records (Pos: {y_test.sum()}, Prev: {test_prev:.4f})")

# ---------------------------------------------------------------------------
# 2. LOAD PRODUCTION UNCALIBRATED BASELINE
# ---------------------------------------------------------------------------
prod_artifact = joblib.load("ML/mlapp/model_artifacts/model.joblib")
prod_model = prod_artifact["model"]

# Predict on untouched test set
y_prob_prod = prod_model.predict_proba(X_test)[:, 1]

# ---------------------------------------------------------------------------
# 3. FIT CALIBRATORS USING TRAINING DATA ONLY
# ---------------------------------------------------------------------------
# Approach A: Nested Cross-Validation Calibration (5-fold inside X_train_full)
# Note: Base estimator has the exact hyperparameters of production model
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

# Platt Scaling (Sigmoid) fitted STRICTLY via 5-fold CV inside X_train_full
print("\nFitting Platt Calibrator via 5-fold CV inside Training Set...")
cal_platt_cv = CalibratedClassifierCV(estimator=base_pipeline, method="sigmoid", cv=5)
cal_platt_cv.fit(X_train_full, y_train_full)
y_prob_platt = cal_platt_cv.predict_proba(X_test)[:, 1]

# Isotonic Calibration fitted STRICTLY via 5-fold CV inside X_train_full
print("Fitting Isotonic Calibrator via 5-fold CV inside Training Set...")
cal_iso_cv = CalibratedClassifierCV(estimator=base_pipeline, method="isotonic", cv=5)
cal_iso_cv.fit(X_train_full, y_train_full)
y_prob_iso = cal_iso_cv.predict_proba(X_test)[:, 1]

# Approach B: Explicit 3-Way Split (60% Train, 20% Calibrate, 20% Test)
# Evaluated strictly inside X_train_full using a single validation split
train_idx, calib_idx = train_test_split(
    np.arange(len(X_train_full)), test_size=0.25, random_state=42, stratify=y_train_full
)
print(f"3-Way Split Sizes -> Sub-Train: {len(train_idx)}, Calib: {len(calib_idx)}, Test: {len(X_test)}")

custom_cv = [(train_idx, calib_idx)]
cal_platt_split = CalibratedClassifierCV(estimator=base_pipeline, method="sigmoid", cv=custom_cv)
cal_platt_split.fit(X_train_full, y_train_full)
y_prob_platt_split = cal_platt_split.predict_proba(X_test)[:, 1]

# Constant-Prevalence Baseline (predicts training prevalence for all test samples)
y_prob_const = np.full_like(y_prob_prod, fill_value=train_prev)

# ---------------------------------------------------------------------------
# 4. CALIBRATION SLOPE AND INTERCEPT FUNCTION
# ---------------------------------------------------------------------------
def compute_calibration_slope_intercept(y_true, y_prob, eps=1e-6):
    """
    Fits logistic regression on logit(prob) to determine:
    - Calibration intercept (calibration-in-the-large, ideal = 0)
    - Calibration slope (refinement/scaling, ideal = 1)
    """
    p = np.clip(y_prob, eps, 1 - eps)
    logit_p = np.log(p / (1 - p)).reshape(-1, 1)
    lr = LogisticRegression(penalty=None, solver="lbfgs")
    lr.fit(logit_p, y_true)
    intercept = float(lr.intercept_[0])
    slope = float(lr.coef_[0][0])
    return intercept, slope

# Expected Calibration Error (ECE)
def compute_ece(y_true, y_prob, n_bins=10):
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
    bin_totals = np.histogram(y_prob, bins=n_bins, range=(0, 1))[0]
    non_empty = bin_totals > 0
    weights = bin_totals[non_empty] / len(y_true)
    ece = np.sum(np.abs(prob_true - prob_pred) * weights)
    mce = np.max(np.abs(prob_true - prob_pred))
    return float(ece), float(mce), prob_true, prob_pred

# ---------------------------------------------------------------------------
# 5. EVALUATE ALL MODELS ON UNTOUCHED TEST SET
# ---------------------------------------------------------------------------
models_eval = {
    "Constant-Prevalence Baseline": y_prob_const,
    "Production Model (Uncalibrated)": y_prob_prod,
    "Platt Scaling (5-Fold CV In-Train)": y_prob_platt,
    "Isotonic Calibration (5-Fold CV In-Train)": y_prob_iso,
    "Platt Scaling (3-Way Split Holdout Calib)": y_prob_platt_split,
}

comparison_results = []

for name, probs in models_eval.items():
    brier = brier_score_loss(y_test, probs)
    ll = log_loss(y_test, probs)
    try:
        auc = roc_auc_score(y_test, probs)
    except:
        auc = 0.50
    
    if name == "Constant-Prevalence Baseline":
        inter, slope = 0.0, 0.0
        ece, mce = 0.0, 0.0
    else:
        inter, slope = compute_calibration_slope_intercept(y_test, probs)
        ece, mce, _, _ = compute_ece(y_test, probs)
    
    comparison_results.append({
        "Model / Strategy": name,
        "Brier Score (↓)": round(brier, 4),
        "Log Loss (↓)": round(ll, 4),
        "ROC-AUC (↑)": round(auc, 4),
        "Calib Intercept (ideal 0)": round(inter, 4),
        "Calib Slope (ideal 1)": round(slope, 4),
        "ECE (↓)": round(ece, 4),
        "MCE (↓)": round(mce, 4),
    })

df_comp = pd.DataFrame(comparison_results)
print("\n" + "="*80)
print("LEAKAGE-SAFE MODEL COMPARISON ON UNTOUCHED TEST SET (N = 848)")
print("="*80)
print(df_comp.to_string(index=False))

# ---------------------------------------------------------------------------
# 6. THRESHOLD SENSITIVITY & CONFUSION MATRICES
# ---------------------------------------------------------------------------
thresholds = [0.10, 0.15, 0.20, 0.30, 0.35, 0.40, 0.50]

def evaluate_thresholds(y_true, y_prob, model_name):
    rows = []
    for t in thresholds:
        pred = (y_prob >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, pred).ravel()
        sens = tp / (tp + fn) if (tp + fn) > 0 else 0
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0
        f1 = 2 * (prec * sens) / (prec + sens) if (prec + sens) > 0 else 0
        acc = (tp + tn) / len(y_true)
        rows.append({
            "Threshold": t,
            "Sensitivity (Recall)": f"{sens*100:.1f}%",
            "Specificity": f"{spec*100:.1f}%",
            "Precision (PPV)": f"{prec*100:.1f}%",
            "F1-Score": f"{f1:.4f}",
            "Accuracy": f"{acc*100:.1f}%",
            "Confusion Matrix [TN, FP, FN, TP]": f"[{tn}, {fp}, {fn}, {tp}]"
        })
    return pd.DataFrame(rows)

print("\n" + "="*80)
print("THRESHOLD EVALUATION: PRODUCTION UNCALIBRATED MODEL")
print("="*80)
print(evaluate_thresholds(y_test, y_prob_prod, "Production Uncalibrated").to_string(index=False))

print("\n" + "="*80)
print("THRESHOLD EVALUATION: PLATT SCALED (LEAKAGE-SAFE CV) MODEL")
print("="*80)
print(evaluate_thresholds(y_test, y_prob_platt, "Platt Calibrated").to_string(index=False))

# ---------------------------------------------------------------------------
# 7. CLINICAL RISK CATEGORY DISTRIBUTION (NCEP ATP III)
# ---------------------------------------------------------------------------
def evaluate_clinical_tiers(y_prob, name):
    low = np.sum(y_prob < 0.10)
    med = np.sum((y_prob >= 0.10) & (y_prob < 0.20))
    high = np.sum(y_prob >= 0.20)
    n = len(y_prob)
    return {
        "Model": name,
        "Low (<10%) Count": f"{low} ({low/n*100:.1f}%)",
        "Moderate (10-20%) Count": f"{med} ({med/n*100:.1f}%)",
        "High (>=20%) Count": f"{high} ({high/n*100:.1f}%)"
    }

tier_comp = [
    evaluate_clinical_tiers(y_prob_prod, "Production (Uncalibrated)"),
    evaluate_clinical_tiers(y_prob_platt, "Platt Scaled (5-Fold CV)"),
    evaluate_clinical_tiers(y_prob_iso, "Isotonic (5-Fold CV)"),
]
print("\n" + "="*80)
print("CLINICAL RISK TIER SHIFT (NCEP ATP III: <10%, 10-20%, >=20%) ON TEST SET")
print("="*80)
print(pd.DataFrame(tier_comp).to_string(index=False))

# ---------------------------------------------------------------------------
# 8. GENERATE CALIBRATION PLOTS
# ---------------------------------------------------------------------------
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Plot A: Calibration Curves
axes[0].plot([0, 1], [0, 1], "k--", label="Perfect Calibration (y = x)")

for name, probs, color, marker in [
    ("Production Uncalibrated", y_prob_prod, "#d32f2f", "s"),
    ("Platt Scaling (5-Fold CV)", y_prob_platt, "#1976d2", "o"),
    ("Isotonic (5-Fold CV)", y_prob_iso, "#388e3c", "^"),
]:
    pt, pp = calibration_curve(y_test, probs, n_bins=10, strategy="uniform")
    brier = brier_score_loss(y_test, probs)
    axes[0].plot(pp, pt, marker=marker, label=f"{name} (Brier: {brier:.4f})", color=color, lw=2)

axes[0].set_xlabel("Mean Predicted Probability", fontsize=11)
axes[0].set_ylabel("Empirical Fraction of Positives (Observed)", fontsize=11)
axes[0].set_title("Reliability Diagram (Untouched Holdout N=848)", fontsize=12, fontweight="bold")
axes[0].legend(loc="upper left")
axes[0].grid(True, alpha=0.3)

# Plot B: Probability Density / Histogram
axes[1].hist(y_prob_prod, bins=20, alpha=0.4, color="#d32f2f", label="Production Uncalibrated", density=True)
axes[1].hist(y_prob_platt, bins=20, alpha=0.4, color="#1976d2", label="Platt Scaled", density=True)
axes[1].set_xlabel("Predicted Probability", fontsize=11)
axes[1].set_ylabel("Density", fontsize=11)
axes[1].set_title("Predicted Probability Distribution", fontsize=12, fontweight="bold")
axes[1].legend(loc="upper right")
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plot_path = "/Users/utkarshsood/.gemini/antigravity/brain/fdd89f5c-97bc-4d59-9f78-16c146b0fcc8/framingham_leakage_safe_calibration.png"
plt.savefig(plot_path, dpi=150)
print(f"\nSaved calibration plot to: {plot_path}")

