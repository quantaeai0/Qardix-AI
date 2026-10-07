import cv2
import numpy as np
from typing import Tuple, Optional


def perform_ecg_quality_check(image_bytes: bytes) -> Tuple[str, Optional[str]]:
    """
    Performs OpenCV rule-based image quality checks for ECG upload.
    Returns (quality_status, quality_reason)
    quality_status: "accepted" | "needs_reupload"
    """
    try:
        # Decode image bytes
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return "needs_reupload", "Invalid or corrupted image format. Please upload a clear JPG/PNG photo."

        height, width = img.shape[:2]

        # 1. Resolution Check
        if width < 300 or height < 300:
            return "needs_reupload", f"Image resolution too low ({width}x{height}px). Minimum required is 300x300px."

        # 2. Blur Check (Laplacian Variance)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

        if laplacian_var < 50.0:
            return "needs_reupload", "Image is blurry. Please keep the paper flat and take a steady, focused photo."

        return "accepted", None

    except Exception as e:
        return "needs_reupload", f"Quality check error: {str(e)}"
