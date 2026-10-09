"""
Singleton model loader for YOLO and other AI models.
Prevents reloading model weights on every HTTP request.
"""
from typing import Optional
import threading

_yolo_model = None
_model_lock = threading.Lock()

# Ignore weak detections (ultralytics default is 0.25): a low-confidence box would pick the crop/colors.
YOLO_MIN_CONFIDENCE = 0.35


class _YoloWithThreshold:
    """
    The YOLO model, with the minimum confidence applied on every call. Setting model.overrides['conf'] is NOT enough:
    ultralytics ignores it once its predictor exists, so detections down to 0.25 were being accepted.
    """
    def __init__(self, model):
        self._model = model

    def __call__(self, *args, **kwargs):
        kwargs.setdefault("conf", YOLO_MIN_CONFIDENCE)
        return self._model(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._model, name)


def get_yolo_model():
    """
    Returns a cached instance of the YOLO nano model (yolov8n.pt).
    Thread-safe lazy initialization.
    """
    global _yolo_model
    if _yolo_model is None:
        with _model_lock:
            if _yolo_model is None:
                import os
                import torch
                from ultralytics import YOLO
                # YOLO would otherwise use every CPU core and slow down everything else on the machine
                torch.set_num_threads(max(1, int(os.getenv("AI_TORCH_THREADS", "2"))))
                _yolo_model = _YoloWithThreshold(YOLO('yolov8n.pt'))
    return _yolo_model
