# =============================================================================
# Explainable AI (XAI) Service for CardioSight Framingham CHD Model
# Uses genuine SHAP (TreeExplainer) on the trained RandomForest ensemble.
# =============================================================================
import numpy as np
import pandas as pd
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    shap = None
    SHAP_AVAILABLE = False
from .model_store import load_model
from .preprocess import build_features

def is_shap_available():
    return SHAP_AVAILABLE

FEATURE_METADATA = {
    "male": {"label": "Biological Sex", "unit": ""},
    "age": {"label": "Age", "unit": "years"},
    "education": {"label": "Education Level", "unit": "level"},
    "currentSmoker": {"label": "Current Smoker", "unit": ""},
    "cigsPerDay": {"label": "Cigarettes per Day", "unit": "cigs/day"},
    "BPMeds": {"label": "Blood Pressure Medication", "unit": ""},
    "prevalentStroke": {"label": "History of Stroke", "unit": ""},
    "prevalentHyp": {"label": "Hypertension History", "unit": ""},
    "diabetes": {"label": "Diabetes Mellitus", "unit": ""},
    "totChol": {"label": "Total Cholesterol", "unit": "mg/dL"},
    "sysBP": {"label": "Systolic Blood Pressure", "unit": "mmHg"},
    "diaBP": {"label": "Diastolic Blood Pressure", "unit": "mmHg"},
    "BMI": {"label": "Body Mass Index (BMI)", "unit": "kg/m²"},
    "heartRate": {"label": "Resting Heart Rate", "unit": "bpm"},
    "glucose": {"label": "Fasting Blood Glucose", "unit": "mg/dL"},
}

def format_feature_value(fname, raw_val, imputed_val=None):
    if raw_val is None or pd.isna(raw_val):
        if imputed_val is not None and not pd.isna(imputed_val):
            return f"Not Provided (Imputed: {format_feature_value(fname, imputed_val)})"
        return "Not Provided"

    try:
        if fname == "male":
            return "Male" if int(raw_val) == 1 else "Female"
        if fname == "age":
            return f"{int(raw_val)} yrs"
        if fname == "education":
            return f"Level {int(raw_val)}"
        if fname == "currentSmoker":
            return "Active Smoker" if int(raw_val) == 1 else "Non-Smoker"
        if fname == "cigsPerDay":
            return f"{int(raw_val)} cigs/day"
        if fname == "BPMeds":
            return "Taking Meds" if int(raw_val) == 1 else "No Meds"
        if fname == "prevalentStroke":
            return "Prior Stroke" if int(raw_val) == 1 else "No Stroke"
        if fname == "prevalentHyp":
            return "Hypertensive" if int(raw_val) == 1 else "Normotensive"
        if fname == "diabetes":
            return "Diabetic" if int(raw_val) == 1 else "Non-Diabetic"
        if fname == "totChol":
            return f"{float(raw_val):.0f} mg/dL"
        if fname in ("sysBP", "diaBP"):
            return f"{float(raw_val):.0f} mmHg"
        if fname == "BMI":
            return f"{float(raw_val):.1f} kg/m²"
        if fname == "heartRate":
            return f"{float(raw_val):.0f} bpm"
        if fname == "glucose":
            return f"{float(raw_val):.0f} mg/dL"
    except Exception:
        pass
    return str(raw_val)

_explainer = None

def get_explainer():
    """
    Returns cached shap.TreeExplainer instance on the Random Forest classifier.
    """
    global _explainer
    if _explainer is not None:
        return _explainer

    if not is_shap_available():
        raise RuntimeError(
            "SHAP package is not installed or available in this Python environment. "
            "Please install 'shap' (e.g. pip install shap>=0.45.0) to compute model explanations."
        )

    artifact = load_model()
    classifier = artifact["model"].named_steps["classifier"]
    _explainer = shap.TreeExplainer(classifier)
    return _explainer


def explain_prediction(features_dict):
    """
    Generates genuine SHAP explanation and feature attributions for a single Framingham prediction.
    """
    if not is_shap_available():
        raise RuntimeError(
            "SHAP package is not installed or available in this Python environment. "
            "Please install 'shap' (e.g. pip install shap>=0.45.0) to compute model explanations."
        )

    artifact = load_model()
    pipeline = artifact["model"]
    imputer = pipeline.named_steps["imputer"]
    classifier = pipeline.named_steps["classifier"]
    feature_names = artifact["feature_names"]

    # 1. Build and validate input DataFrame
    X_raw = build_features(features_dict)
    X = X_raw[feature_names]

    # 2. Impute missing values through pipeline's trained imputer
    X_imputed = imputer.transform(X)

    # 3. Model predictions
    prediction_class = int(classifier.predict(X_imputed)[0])
    prob_array = classifier.predict_proba(X_imputed)[0]
    predicted_probability = float(prob_array[1])  # Class 1 = 10-year CHD
    risk_score = round(predicted_probability * 100, 2)

    # 4. Compute exact SHAP values
    explainer = get_explainer()
    shap_obj = explainer(X_imputed)

    # Base value for positive class
    if isinstance(explainer.expected_value, (list, np.ndarray)):
        base_value = float(explainer.expected_value[1])
    else:
        base_value = float(explainer.expected_value)

    base_pct = round(base_value * 100, 2)

    # SHAP values for class 1
    if len(shap_obj.values.shape) == 3:
        raw_shap = shap_obj.values[0, :, 1]
    else:
        raw_shap = shap_obj.values[0, :]

    # 5. Build structured individual feature contributions
    contributions = []
    total_shap_sum = 0.0

    for i, fname in enumerate(feature_names):
        val = X.iloc[0, i]
        imp_val = X_imputed[0, i]
        s_val = float(raw_shap[i])
        total_shap_sum += s_val
        shift_pct = round(s_val * 100, 2)
        meta = FEATURE_METADATA.get(fname, {"label": fname, "unit": ""})
        formatted_val = format_feature_value(fname, val, imp_val)
        json_raw_val = None if (val is None or pd.isna(val)) else float(val)

        if shift_pct > 0.05:
            direction = "increased_risk"
            direction_label = "Increases Risk"
        elif shift_pct < -0.05:
            direction = "decreased_risk"
            direction_label = "Decreases Risk"
        else:
            direction = "neutral"
            direction_label = "Minimal Impact"

        contributions.append({
            "feature": fname,
            "label": meta["label"],
            "raw_value": json_raw_val,
            "formatted_value": formatted_val,
            "unit": meta["unit"],
            "shap_value": round(s_val, 5),
            "contribution_pct": shift_pct,
            "direction": direction,
            "direction_label": direction_label,
            "magnitude": round(abs(shift_pct), 2),
            "clinical_insight": (
                f"{meta['label']} ({formatted_val}) elevated the estimated probability by +{shift_pct}%."
                if direction == "increased_risk" else
                f"{meta['label']} ({formatted_val}) mitigated the estimated probability by {shift_pct}%."
                if direction == "decreased_risk" else
                f"{meta['label']} ({formatted_val}) had negligible deviation from baseline expectations."
            )
        })

    # Mathematical consistency verification: base_value + sum(shap) == predicted_probability
    reconstructed_prob = round((base_value + total_shap_sum) * 100, 2)

    # 6. Global Feature Importances from model
    global_importances = []
    for fname, imp in zip(feature_names, classifier.feature_importances_):
        meta = FEATURE_METADATA.get(fname, {"label": fname})
        global_importances.append({
            "feature": fname,
            "label": meta["label"],
            "importance": round(float(imp) * 100, 2)
        })
    global_importances.sort(key=lambda x: x["importance"], reverse=True)

    # 7. Sort contributions for top factors
    positive_factors = [c for c in contributions if c["direction"] == "increased_risk"]
    positive_factors.sort(key=lambda x: x["contribution_pct"], reverse=True)

    negative_factors = [c for c in contributions if c["direction"] == "decreased_risk"]
    negative_factors.sort(key=lambda x: x["contribution_pct"])

    # 8. Waterfall Chart Data:
    # Sort features by absolute contribution so the most impactful shifts appear first
    sorted_by_abs = sorted(contributions, key=lambda x: abs(x["contribution_pct"]), reverse=True)

    waterfall_steps = []
    running_prob = base_pct
    waterfall_steps.append({
        "label": "Model Baseline Prior",
        "shift": 0.0,
        "running_total": running_prob,
        "type": "baseline",
        "description": f"Average 10-year risk across training cohort ({base_pct}%)"
    })

    for c in sorted_by_abs:
        running_prob = round(running_prob + c["contribution_pct"], 2)
        waterfall_steps.append({
            "label": c["label"],
            "feature": c["feature"],
            "formatted_value": c["formatted_value"],
            "shift": c["contribution_pct"],
            "running_total": running_prob,
            "type": "increase" if c["contribution_pct"] > 0 else "decrease",
            "description": c["clinical_insight"]
        })

    waterfall_steps.append({
        "label": "Final Predicted Risk",
        "shift": 0.0,
        "running_total": risk_score,
        "type": "final",
        "description": f"Calculated 10-year CHD probability ({risk_score}%)"
    })

    # 9. Dynamic Personalized Explanation
    pos_desc = ", ".join([f"{f['label']} ({f['formatted_value']}: +{f['contribution_pct']}%)" for f in positive_factors[:3]])
    neg_desc = ", ".join([f"{f['label']} ({f['formatted_value']}: {f['contribution_pct']}%)" for f in negative_factors[:3]])

    personalized_parts = [
        f"For this patient, the model estimates a 10-year coronary heart disease probability of {risk_score}%, starting from an ensemble baseline expectation of {base_pct}%."
    ]
    if positive_factors:
        personalized_parts.append(f"The primary contributors increasing estimated risk above the baseline were {pos_desc}.")
    else:
        personalized_parts.append("No clinical biomarkers substantially elevated the prediction above baseline.")

    if negative_factors:
        personalized_parts.append(f"In contrast, protective or favorable parameters that mitigated the score downward were {neg_desc}.")
    else:
        personalized_parts.append("Few features exhibited significant risk-reducing effects for this profile.")

    personalized_explanation = " ".join(personalized_parts)

    return {
        "model_type": "RandomForestClassifier",
        "explanation_method": "SHAP (TreeExplainer)",
        "time_horizon": "10-Year Coronary Heart Disease Risk",
        "predicted_probability": risk_score,
        "predicted_class": prediction_class,
        "base_value": base_pct,
        "reconstructed_probability": reconstructed_prob,
        "mathematical_consistency": abs(risk_score - reconstructed_prob) < 0.1,
        "feature_contributions": contributions,
        "top_positive_factors": positive_factors[:5],
        "top_negative_factors": negative_factors[:5],
        "waterfall_steps": waterfall_steps,
        "global_feature_importance": global_importances,
        "personalized_explanation": personalized_explanation,
        "disclaimer": (
            "Feature contributions (SHAP attributions) quantify mathematical shifts in this individual model's decision process. "
            "They explain model behavior rather than physiological medical causation. "
            "These findings do not guarantee risk reduction upon isolated feature modification and must not replace professional medical evaluation."
        )
    }
