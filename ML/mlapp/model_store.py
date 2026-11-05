import os
import joblib
import warnings
from pathlib import Path
from sklearn.exceptions import InconsistentVersionWarning

ARTIFACTS_DIR = Path(__file__).resolve().parent / "model_artifacts"
ORIGINAL_MODEL_PATH = ARTIFACTS_DIR / "model.joblib"
CALIBRATED_MODEL_PATH = ARTIFACTS_DIR / "model_calibrated.joblib"
TMT_MODEL_PATH = ARTIFACTS_DIR / "tmt_uci_model.joblib"

_loaded_v1 = None
_loaded_v2 = None
_loaded_tmt = None


def get_active_framingham_version():
    """Returns the globally configured Framingham model version ('v1' or 'v2'). Defaults to 'v1'."""
    val = os.environ.get("FRAMINGHAM_MODEL_VERSION", "v1").strip().lower()
    if val in ("v2", "platt", "calibrated"):
        return "v2"
    return "v1"


def load_model(version=None):
    """
    Loads either 'v1' (original uncalibrated model.joblib) or 'v2' (Platt-calibrated model_calibrated.joblib).
    If version is None, falls back to the active environment configuration (default: 'v1').
    """
    global _loaded_v1, _loaded_v2

    target_version = (version.strip().lower() if version else get_active_framingham_version())
    is_v2 = target_version in ("v2", "platt", "calibrated")

    if is_v2:
        if _loaded_v2 is not None:
            return _loaded_v2
        if not CALIBRATED_MODEL_PATH.exists():
            raise FileNotFoundError(f"Calibrated Framingham model V2 not found: {CALIBRATED_MODEL_PATH}")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", InconsistentVersionWarning)
            data = joblib.load(CALIBRATED_MODEL_PATH)
            data["artifact_file"] = "model_calibrated.joblib"
            data["version"] = "v2_platt_calibrated"
            _loaded_v2 = data
        print(f"[mlapp] Framingham Platt-calibrated model V2 loaded from {CALIBRATED_MODEL_PATH}")
        return _loaded_v2

    # Default to V1 (original production model)
    if _loaded_v1 is not None:
        return _loaded_v1
    if not ORIGINAL_MODEL_PATH.exists():
        raise FileNotFoundError(f"Original Framingham model V1 not found: {ORIGINAL_MODEL_PATH}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InconsistentVersionWarning)
        data = joblib.load(ORIGINAL_MODEL_PATH)
        data["artifact_file"] = "model.joblib"
        data["version"] = "v1_original"
        _loaded_v1 = data
    print(f"[mlapp] Original Framingham model V1 loaded from {ORIGINAL_MODEL_PATH}")
    return _loaded_v1


def load_tmt_model():
    global _loaded_tmt

    if _loaded_tmt is not None:
        return _loaded_tmt

    if not TMT_MODEL_PATH.exists():
        raise FileNotFoundError(f"TMT model not found: {TMT_MODEL_PATH}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InconsistentVersionWarning)
        _loaded_tmt = joblib.load(TMT_MODEL_PATH)
    print(f"[mlapp] TMT model loaded from {TMT_MODEL_PATH}")

    return _loaded_tmt
