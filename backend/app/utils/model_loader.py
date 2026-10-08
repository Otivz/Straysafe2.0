"""
Singleton model loader for YOLO and other AI models.
Prevents reloading model weights on every HTTP request.
"""
from typing import Optional
import threading

_yolo_model = None
_model_lock = threading.Lock()


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
                _yolo_model = YOLO('yolov8n.pt')
                # Ignore weak detections (ultralytics default is 0.25): a low-confidence box would pick the crop/colors
                _yolo_model.overrides['conf'] = 0.35
    return _yolo_model
