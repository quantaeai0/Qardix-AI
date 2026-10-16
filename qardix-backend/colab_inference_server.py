"""
Qardix AI — Google Colab Inference Server (Stage 2)

TWO endpoints on one server:
  POST /digitise  — ECG-Digitiser (nnU-Net) image → waveforms
  POST /predict   — DeepECG model waveforms → classification

Copy each cell below into separate Colab notebook cells and run in order.

.env configuration (same URL for both endpoints):
    INFERENCE_BACKEND=colab
    COLAB_INFERENCE_URL=https://YOUR-NGROK-ID.ngrok-free.app
    COLAB_API_KEY=your-shared-secret
"""

# ═══════════════════════════════════════════════════════════════════════════════
# CELL 1 — Install dependencies
# ═══════════════════════════════════════════════════════════════════════════════
CELL_1 = """
!pip install -q fastapi uvicorn pyngrok nest_asyncio wfdb

# Clone ECG-Digitiser (includes pretrained nnU-Net weights via git-lfs)
!git lfs install
!git clone https://github.com/felixkrones/ECG-Digitiser.git /content/ECG-Digitiser
%cd /content/ECG-Digitiser

# Install nnU-Net from the bundled fork (fixes RGB png bug)
!pip install -q -e nnUNet/
!pip install -r requirements.txt -q

# Install prediction model dependencies (PyTorch already in Colab)
# !pip install -q onnxruntime   # if using ONNX for DeepECG
"""

# ═══════════════════════════════════════════════════════════════════════════════
# CELL 2 — Server code (paste this entire block as one cell)
# ═══════════════════════════════════════════════════════════════════════════════
CELL_2 = '''
import os
import sys
import base64
import tempfile
import json
import shutil
import subprocess
import threading

import nest_asyncio
import uvicorn
import numpy as np
import wfdb
from fastapi import FastAPI, HTTPException, Header, Request
from pyngrok import ngrok

nest_asyncio.apply()

# Add ECG-Digitiser to path
sys.path.insert(0, "/content/ECG-Digitiser")

# ── Config ────────────────────────────────────────────────────────────────────
COLAB_API_KEY  = "CHANGE_THIS_TO_MATCH_YOUR_COLAB_API_KEY"   # must match .env
NGROK_TOKEN    = "YOUR_NGROK_AUTH_TOKEN"                      # from ngrok.com/auth
MODEL_FOLDER   = "/content/ECG-Digitiser/models/M3/"          # pretrained weights
SAMPLE_RATE_HZ = 500.0                                         # ECG-Digitiser default

# ── Standard lead order ───────────────────────────────────────────────────────
STANDARD_LEADS = ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"]

# ── Prediction model (load once at startup) ───────────────────────────────────
prediction_model = None

def load_prediction_model():
    """
    Load the DeepECG / WCR-77 prediction model.
    Replace this stub with your actual model-loading code.

    Options:
        ONNX:    import onnxruntime as ort; return ort.InferenceSession("deepecg.onnx")
        PyTorch: import torch; return torch.jit.load("deepecg.pt")
    """
    global prediction_model
    # TODO: load your actual DeepECG model weights here
    # Example ONNX:
    # import onnxruntime as ort
    # prediction_model = ort.InferenceSession("/content/deepecg_wcr77.onnx")
    print("[Predict] Prediction model loading placeholder — implement load_prediction_model()")
    prediction_model = None   # replace with actual model object

load_prediction_model()

# ── Helper: auth check ────────────────────────────────────────────────────────
def check_auth(x_api_key: str):
    if x_api_key != COLAB_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Qardix AI — Colab Inference Server", version="2.0.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "digitiser": "ecg-digitiser-physionet2024",
        "prediction_model_loaded": prediction_model is not None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1: POST /digitise
# Receives preprocessed ECG image bytes (base64 PNG).
# Runs ECG-Digitiser (nnU-Net segmentation + waveform extraction).
# Returns per-lead waveform arrays as JSON.
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/digitise")
async def digitise(request: Request, x_api_key: str = Header(None)):
    """
    Input (JSON):
        {
          "image_b64": "<base64-encoded PNG>",
          "leads": ["I", "II", "III", "aVR", "aVL", "aVF",
                    "V1", "V2", "V3", "V4", "V5", "V6"]
        }

    Output (JSON):
        {
          "leads": {
            "I":   [float, ...],   # 5000 samples at 500 Hz
            "II":  [float, ...],
            ...
          },
          "sample_rate_hz": 500.0,
          "duration_seconds": 10.0,
          "digitiser_version": "ecg-digitiser-physionet2024"
        }

    Errors: HTTP 422 with {"detail": "..."} on failure.
    """
    check_auth(x_api_key)

    body = await request.json()
    image_b64 = body.get("image_b64", "")
    requested_leads = body.get("leads", STANDARD_LEADS)

    if not image_b64:
        raise HTTPException(status_code=422, detail="Missing image_b64 in request body")

    # Decode image bytes
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid base64 image data: {e}")

    # Run ECG-Digitiser in a temp directory
    work_dir = tempfile.mkdtemp(prefix="qardix_ecg_")
    try:
        leads_dict = _run_ecg_digitiser(image_bytes, work_dir)
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"ECG digitisation failed: {e}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    if not leads_dict:
        raise HTTPException(
            status_code=422,
            detail="ECG-Digitiser returned no lead signals. "
                   "Check that the image matches the expected 3x4 12-lead layout."
        )

    return {
        "leads": leads_dict,
        "sample_rate_hz": SAMPLE_RATE_HZ,
        "duration_seconds": len(next(iter(leads_dict.values()))) / SAMPLE_RATE_HZ,
        "digitiser_version": "ecg-digitiser-physionet2024",
    }


def _run_ecg_digitiser(image_bytes: bytes, work_dir: str) -> dict:
    """
    Saves image to disk, runs ECG-Digitiser CLI, reads WFDB output.

    ECG-Digitiser output format:
        WFDB .mat + .hea files (one per input image).
        wfdb.rdrecord() → record.p_signal: np.ndarray shape (n_samples, n_leads)
        record.sig_name: list of lead names matching LEAD_LABEL_MAPPING in config.py

    Returns:
        { "I": [float,...], "II": [float,...], ... }
    """
    import cv2

    # Write image to input folder
    input_dir  = os.path.join(work_dir, "input")
    output_dir = os.path.join(work_dir, "output")
    os.makedirs(input_dir,  exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)

    img_path = os.path.join(input_dir, "ecg_image.png")
    nparr = np.frombuffer(image_bytes, np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes as PNG/JPEG")
    cv2.imwrite(img_path, img)

    # Run CLI: python -m src.run.digitize -d <input> -o <output> -m <models>
    cmd = [
        sys.executable, "-m", "src.run.digitize",
        "-d", input_dir,
        "-o", output_dir,
        "-m", MODEL_FOLDER,
    ]
    result = subprocess.run(
        cmd,
        cwd="/content/ECG-Digitiser",
        capture_output=True,
        text=True,
        timeout=150,          # nnU-Net on Colab CPU can take ~60-120s
    )
    if result.returncode != 0:
        raise ValueError(
            f"ECG-Digitiser CLI exited with code {result.returncode}.\n"
            f"stderr: {result.stderr[-800:]}\n"
            f"stdout: {result.stdout[-400:]}"
        )

    # Find the WFDB output file (name matches input filename without extension)
    wfdb_base = None
    for fname in os.listdir(output_dir):
        if fname.endswith(".hea"):
            wfdb_base = os.path.join(output_dir, fname[:-4])
            break

    if wfdb_base is None:
        raise ValueError(
            f"ECG-Digitiser produced no .hea file in {output_dir}. "
            f"stdout: {result.stdout[-400:]}"
        )

    # Read WFDB record
    try:
        record = wfdb.rdrecord(wfdb_base)
    except Exception as e:
        raise ValueError(f"Failed to read WFDB output: {e}")

    # record.p_signal: shape (n_samples, n_leads), in physical units (mV)
    # record.sig_name: lead name strings
    p_signal = record.p_signal          # np.ndarray or None
    sig_names = record.sig_name or []

    if p_signal is None or p_signal.size == 0:
        raise ValueError("WFDB record contains no signal data (p_signal is empty).")

    leads_dict = {}
    for i, name in enumerate(sig_names):
        col = p_signal[:, i]
        # Replace NaN with 0 (NaN can appear at boundaries in WFDB records)
        col = np.nan_to_num(col, nan=0.0)
        leads_dict[name] = col.tolist()

    return leads_dict


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2: POST /predict
# Receives normalised per-lead waveforms (ModelInput format).
# Runs DeepECG / WCR-77 classification model.
# Returns logits + top findings.
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/predict")
async def predict(request: Request, x_api_key: str = Header(None)):
    """
    Input (JSON) — ModelInput.to_dict() from laptop:
        {
          "waveform_data": { "I": [float,...], "II": [float,...], ... },
          "sample_rate_hz": 500.0,
          "clinical_context": { "age": 45, "sex": "Male", ... },
          "model_adapter": "deepecg_wcr77"
        }

    Output (JSON):
        {
          "logits":   { "Normal_sinus_rhythm": 0.95, "ST_elevation_MI": 0.02, ... },
          "top_findings": [{"label": "...", "probability": 0.95}],
          "model_name": "deepecg_wcr77",
          "model_version": "1.0.0",
          "inference_provider": "colab"
        }
    """
    check_auth(x_api_key)

    body = await request.json()
    waveform_data = body.get("waveform_data", {})
    sample_rate   = body.get("sample_rate_hz", 500.0)
    clinical_ctx  = body.get("clinical_context", {})
    model_adapter = body.get("model_adapter", "deepecg_wcr77")

    if not waveform_data:
        raise HTTPException(status_code=422, detail="Missing waveform_data in request body")

    # ── Run prediction model ──────────────────────────────────────────────────
    # TODO: Replace this block with real model inference.
    #
    # ONNX example:
    #   lead_order = ["I","II","III","aVR","aVL","aVF","V1","V2","V3","V4","V5","V6"]
    #   arr = np.array([waveform_data.get(l, [0.0]*5000) for l in lead_order], dtype=np.float32)
    #   arr = arr.reshape(1, 12, 5000)
    #   ort_inputs = {prediction_model.get_inputs()[0].name: arr}
    #   output = prediction_model.run(None, ort_inputs)[0][0]   # shape: (77,)
    #   WCR77_LABELS = [...]   # list of 77 class names
    #   logits_dict = {WCR77_LABELS[i]: float(output[i]) for i in range(77)}
    #
    # PyTorch example:
    #   import torch
    #   arr = torch.tensor([waveform_data.get(l, [0.0]*5000)
    #                       for l in lead_order], dtype=torch.float32).unsqueeze(0)
    #   with torch.no_grad():
    #       logits = prediction_model(arr).sigmoid()[0]
    #   logits_dict = {WCR77_LABELS[i]: float(logits[i]) for i in range(77)}
    #
    # For now (model not yet loaded) — placeholder response:
    logits_dict = {
        "Normal_sinus_rhythm": 0.95,
        "ST_elevation_MI":     0.02,
        "Sinus_bradycardia":   0.01,
    }
    # ─────────────────────────────────────────────────────────────────────────

    # Build top_findings (all above 0.5 threshold, sorted by probability)
    top_findings = sorted(
        [{"label": k, "probability": v} for k, v in logits_dict.items() if v >= 0.5],
        key=lambda x: x["probability"],
        reverse=True,
    )

    return {
        "logits":             logits_dict,
        "top_findings":       top_findings,
        "model_name":         model_adapter,
        "model_version":      "1.0.0",
        "inference_provider": "colab",
    }


# ── Start server ──────────────────────────────────────────────────────────────
def start_server():
    ngrok.set_auth_token(NGROK_TOKEN)
    public_url = ngrok.connect(8000)
    print("=" * 65)
    print(f"  Qardix AI Colab server: {public_url}")
    print(f"  Endpoints:")
    print(f"    POST {public_url}/digitise  ← ECG image → waveforms")
    print(f"    POST {public_url}/predict   ← waveforms → classification")
    print(f"    GET  {public_url}/health    ← status check")
    print(f"")
    print(f"  Add to your .env:")
    print(f"    INFERENCE_BACKEND=colab")
    print(f"    COLAB_INFERENCE_URL={public_url}")
    print(f"    COLAB_API_KEY={COLAB_API_KEY}")
    print("=" * 65)
    uvicorn.run(app, host="0.0.0.0", port=8000)


t = threading.Thread(target=start_server, daemon=True)
t.start()
'''

print("=" * 65)
print("  Qardix AI — Colab Inference Server (Stage 2)")
print("")
print("  Paste CELL_1 and CELL_2 into separate Colab notebook cells.")
print("  Run CELL_1 first (installs deps + clones ECG-Digitiser).")
print("  Then run CELL_2 to start the server.")
print("=" * 65)
