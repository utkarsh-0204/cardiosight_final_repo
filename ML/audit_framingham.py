import pandas as pd
import numpy as np
import joblib
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
    brier_score_loss, log_loss, roc_curve, precision_recall_curve
)
from sklearn.calibration import calibration_curve

# 1. Load Data
df = pd.read_csv("ML/framingham.csv")
print(f"Dataset shape: {df.shape}")
print(f"TenYearCHD distribution:\n{df['TenYearCHD'].value_counts(dropna=False)}")
prevalence = df['TenYearCHD'].mean()
print(f"Class imbalance: {prevalence*100:.2f}% positive (TenYearCHD=1), {(1-prevalence)*100:.2f}% negative (TenYearCHD=0)")

X = df.drop("TenYearCHD", axis=1)
y = df["TenYearCHD"]

# Recreate the exact split from train_framingham.py
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

print(f"Train size: {len(X_train)} (Pos: {y_train.sum()}, Neg: {(1-y_train).sum()})")
print(f"Test size: {len(X_test)} (Pos: {y_test.sum()}, Neg: {(1-y_test).sum()})")

# 2. Load Saved Model
artifact = joblib.load("ML/mlapp/model_artifacts/model.joblib")
model = artifact["model"]
feature_names = artifact["feature_names"]

# 3. Evaluate on Test Split
y_prob = model.predict_proba(X_test)[:, 1]
y_pred_default = model.predict(X_test)  # Threshold 0.5

print("\n--- TEST SET EVALUATION AT DEFAULT THRESHOLD (0.50) ---")
roc_auc = roc_auc_score(y_test, y_prob)
acc_def = accuracy_score(y_test, y_pred_default)
rec_def = recall_score(y_test, y_pred_default)
prec_def = precision_score(y_test, y_pred_default)
f1_def = f1_score(y_test, y_pred_default)
cm_def = confusion_matrix(y_test, y_pred_default)

print(f"ROC-AUC: {roc_auc:.4f}")
print(f"Accuracy: {acc_def*100:.2f}%")
print(f"Recall (Sensitivity): {rec_def*100:.2f}%")
print(f"Precision: {prec_def*100:.2f}%")
print(f"F1-Score: {f1_def:.4f}")
print("Confusion Matrix (Default 0.5):")
print(cm_def)
print("\nClassification Report (Default 0.5):")
print(classification_report(y_test, y_pred_default))

# 4. Calibration Metrics
brier = brier_score_loss(y_test, y_prob)
ll = log_loss(y_test, y_prob)
prob_true, prob_pred = calibration_curve(y_test, y_prob, n_bins=10, strategy='uniform')

# Expected Calibration Error (ECE)
bin_totals = np.histogram(y_prob, bins=10, range=(0, 1))[0]
non_empty = bin_totals > 0
ece = np.sum(np.abs(prob_true - prob_pred) * (bin_totals[non_empty] / len(y_test))) if len(prob_true) == len(bin_totals[non_empty]) else -1.0

print("\n--- PROBABILITY CALIBRATION METRICS ---")
print(f"Brier Score Loss: {brier:.4f} (Benchmark: {prevalence*(1-prevalence):.4f} for naive mean prediction)")
print(f"Log Loss: {ll:.4f}")
print("Calibration curve bins:")
for pt, pp in zip(prob_true, prob_pred):
    print(f"  Predicted Prob: {pp:.3f} -> Observed True Fraction: {pt:.3f} (Diff: {pt-pp:+.3f})")

# 5. Threshold Sensitivity Analysis
thresholds = np.linspace(0.05, 0.70, 27)
thresh_results = []
for t in thresholds:
    p_t = (y_prob >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, p_t).ravel()
    sens = tp / (tp + fn) if (tp + fn) > 0 else 0
    spec = tn / (tn + fp) if (tn + fp) > 0 else 0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    f1 = 2 * (prec * sens) / (prec + sens) if (prec + sens) > 0 else 0
    acc = (tp + tn) / len(y_test)
    thresh_results.append({
        "threshold": round(float(t), 2),
        "sensitivity_recall": round(float(sens), 4),
        "specificity": round(float(spec), 4),
        "precision": round(float(prec), 4),
        "f1_score": round(float(f1), 4),
        "accuracy": round(float(acc), 4),
        "tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)
    })

df_thresh = pd.DataFrame(thresh_results)
print("\n--- THRESHOLD SENSITIVITY TABLE ---")
print(df_thresh.to_string(index=False))

# 6. Stratified 5-Fold Cross Validation of the Existing Model Architecture
print("\n--- STRATIFIED 5-FOLD CV ON FULL DATASET (EXISTING MODEL HYPERPARAMETERS) ---")
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_aucs = []
cv_accs = []
cv_recalls = []
cv_precs = []
cv_f1s = []
cv_briers = []

for train_idx, val_idx in skf.split(X, y):
    X_tr, y_tr = X.iloc[train_idx], y.iloc[train_idx]
    X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]
    
    # Clone and fit
    from sklearn.base import clone
    fold_model = clone(model)
    fold_model.fit(X_tr, y_tr)
    
    val_probs = fold_model.predict_proba(X_val)[:, 1]
    val_preds = fold_model.predict(X_val)
    
    cv_aucs.append(roc_auc_score(y_val, val_probs))
    cv_accs.append(accuracy_score(y_val, val_preds))
    cv_recalls.append(recall_score(y_val, val_preds))
    cv_precs.append(precision_score(y_val, val_preds, zero_division=0))
    cv_f1s.append(f1_score(y_val, val_preds, zero_division=0))
    cv_briers.append(brier_score_loss(y_val, val_probs))

print(f"5-Fold CV ROC-AUC: {np.mean(cv_aucs):.4f} +/- {np.std(cv_aucs):.4f}")
print(f"5-Fold CV Accuracy: {np.mean(cv_accs)*100:.2f}% +/- {np.std(cv_accs)*100:.2f}%")
print(f"5-Fold CV Recall (0.5 thresh): {np.mean(cv_recalls)*100:.2f}% +/- {np.std(cv_recalls)*100:.2f}%")
print(f"5-Fold CV Precision (0.5 thresh): {np.mean(cv_precs)*100:.2f}% +/- {np.std(cv_precs)*100:.2f}%")
print(f"5-Fold CV F1-Score: {np.mean(cv_f1s):.4f} +/- {np.std(cv_f1s):.4f}")
print(f"5-Fold CV Brier Score: {np.mean(cv_briers):.4f} +/- {np.std(cv_briers):.4f}")

# 7. Generate Calibration & ROC & PR Plots
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

# Plot 1: Calibration Curve
axes[0].plot([0, 1], [0, 1], "k--", label="Perfectly calibrated")
axes[0].plot(prob_pred, prob_true, "s-", color="#1976d2", label="Framingham Random Forest", lw=2)
axes[0].set_xlabel("Mean predicted probability", fontsize=11)
axes[0].set_ylabel("Fraction of positives (Observed)", fontsize=11)
axes[0].set_title(f"Reliability Curve (Brier: {brier:.4f})", fontsize=12, fontweight='bold')
axes[0].legend(loc="upper left")
axes[0].grid(True, alpha=0.3)

# Plot 2: ROC Curve
fpr, tpr, _ = roc_curve(y_test, y_prob)
axes[1].plot([0, 1], [0, 1], "k--", label="Chance (AUC = 0.50)")
axes[1].plot(fpr, tpr, color="#2e7d32", label=f"RF (AUC = {roc_auc:.4f})", lw=2)
axes[1].set_xlabel("False Positive Rate (1 - Specificity)", fontsize=11)
axes[1].set_ylabel("True Positive Rate (Sensitivity / Recall)", fontsize=11)
axes[1].set_title(f"ROC Curve (Test AUC = {roc_auc:.4f})", fontsize=12, fontweight='bold')
axes[1].legend(loc="lower right")
axes[1].grid(True, alpha=0.3)

# Plot 3: Threshold vs Precision / Recall / F1
axes[2].plot(df_thresh["threshold"], df_thresh["sensitivity_recall"], color="#d32f2f", label="Sensitivity (Recall)", lw=2)
axes[2].plot(df_thresh["threshold"], df_thresh["precision"], color="#0288d1", label="Precision", lw=2)
axes[2].plot(df_thresh["threshold"], df_thresh["f1_score"], color="#7b1fa2", label="F1-Score", lw=2)
axes[2].plot(df_thresh["threshold"], df_thresh["accuracy"], color="#388e3c", label="Accuracy", lw=1.5, ls="--")
axes[2].axvline(x=0.50, color="gray", linestyle=":", label="Default Thresh (0.50)")
axes[2].axvline(x=0.20, color="darkorange", linestyle="-.", label="High Risk Cutoff (0.20)")
axes[2].set_xlabel("Decision Threshold", fontsize=11)
axes[2].set_ylabel("Metric Value", fontsize=11)
axes[2].set_title("Threshold Sensitivity & Class Imbalance Impact", fontsize=12, fontweight='bold')
axes[2].legend(loc="center right", fontsize=9)
axes[2].grid(True, alpha=0.3)

plt.tight_layout()
artifact_plot_path = "/Users/utkarshsood/.gemini/antigravity/brain/fdd89f5c-97bc-4d59-9f78-16c146b0fcc8/framingham_validation_analysis.png"
plt.savefig(artifact_plot_path, dpi=150)
print(f"\nSaved validation plot to {artifact_plot_path}")

