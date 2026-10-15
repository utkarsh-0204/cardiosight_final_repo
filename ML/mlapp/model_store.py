import joblib
import warnings
from pathlib import Path
from sklearn.exceptions import InconsistentVersionWarning

MODEL_PATH = Path(__file__).resolve().parent / "model_artifacts" / "model.joblib"

_loaded = None

def load_model():
    global _loaded

    if _loaded is not None:
        return _loaded

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", InconsistentVersionWarning)
        _loaded = joblib.load(MODEL_PATH)
    print(f"[mlapp] Framingham model loaded from {MODEL_PATH}")

    return _loaded


TMT_MODEL_PATH = Path(__file__).resolve().parent / "model_artifacts" / "tmt_uci_model.joblib"
_loaded_tmt = None

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

