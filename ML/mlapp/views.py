import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .model_store import load_model, load_tmt_model
from .preprocess import build_features
import pandas as pd


@require_GET
def health(request):
    return JsonResponse({
        "success": True,
        "status": "up"
    })


@csrf_exempt
@require_POST
def predict(request):
    try:
        payload = json.loads(
            request.body.decode("utf-8") or "{}"
        )
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON body."
            },
            status=400
        )

    features = payload.get("features") or {}

    try:
        X = build_features(features)
    except ValueError as exc:
        return JsonResponse(
            {
                "success": False,
                "message": str(exc)
            },
            status=400
        )

    try:
        artifact = load_model()
        model = artifact["model"]

        X = X[artifact["feature_names"]]

        prediction = int(model.predict(X)[0])
        probability = float(model.predict_proba(X)[0][1])
        # Confidence derived from distance from decision boundary
        confidence = round(50.0 + abs(probability - 0.5) * 90.0, 1)

        return JsonResponse({
            "success": True,
            "prediction": prediction,
            "probability": round(probability * 100, 2),
            "risk_score": round(probability * 100, 2),
            "confidence": confidence,
            "message": (
                "Higher estimated 10-year CHD risk"
                if prediction == 1
                else "Lower estimated 10-year CHD risk"
            )
        })

    except Exception as exc:
        return JsonResponse(
            {
                "success": False,
                "message": f"Prediction failed: {exc}"
            },
            status=500
        )


@csrf_exempt
@require_POST
def predict_tmt(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"success": False, "message": "Invalid JSON body."}, status=400)

    tmt_data = payload.get("tmt") or {}
    if not isinstance(tmt_data, dict):
        return JsonResponse({"success": False, "message": "TMT payload must be an object."}, status=400)

    try:
        artifact = load_tmt_model()
        model = artifact["model"]
        feature_names = artifact["feature_names"]

        row = {}
        for feat in feature_names:
            val = tmt_data.get(feat)
            if val is None or val == "":
                row[feat] = None
            else:
                try:
                    row[feat] = float(val)
                except (ValueError, TypeError):
                    row[feat] = None

        df_in = pd.DataFrame([row], columns=feature_names)
        pred = int(model.predict(df_in)[0])
        prob = float(model.predict_proba(df_in)[0][1])
        conf = round(50.0 + abs(prob - 0.5) * 90.0, 1)

        return JsonResponse({
            "success": True,
            "cad_prediction": pred,
            "cad_probability": round(prob * 100, 2),
            "confidence": conf,
            "risk_category": "positive_ischemia" if pred == 1 else "negative_ischemia",
            "model_metadata": {
                "dataset": artifact.get("dataset"),
                "target": artifact.get("target"),
                "held_out_metrics": artifact.get("metrics")
            },
            "message": (
                "Exercise stress test findings indicate positive probability of inducible myocardial ischemia."
                if pred == 1 else
                "Exercise stress test findings do not demonstrate significant evidence of inducible ischemia."
            )
        })
    except Exception as exc:
        return JsonResponse({"success": False, "message": f"TMT inference failed: {exc}"}, status=500)


@csrf_exempt
@require_POST
def explain(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"success": False, "message": "Invalid JSON body."}, status=400)

    features = payload.get("features") or {}
    if not isinstance(features, dict) or not features:
        return JsonResponse({"success": False, "message": "Prediction features object is required."}, status=400)

    try:
        from .explainer import explain_prediction, is_shap_available
    except ImportError as imp_err:
        return JsonResponse({
            "success": False,
            "message": f"Explainable AI module unavailable: {imp_err}"
        }, status=503)

    if not is_shap_available():
        return JsonResponse({
            "success": False,
            "message": "SHAP package is not installed or available in this Python environment. Model explanations are disabled."
        }, status=503)

    try:
        explanation_data = explain_prediction(features)
        return JsonResponse({
            "success": True,
            "message": "Prediction explanation calculated successfully.",
            "data": explanation_data
        })
    except ValueError as val_err:
        return JsonResponse({"success": False, "message": str(val_err)}, status=400)
    except Exception as exc:
        return JsonResponse({"success": False, "message": f"Explanation failed: {exc}"}, status=500)


