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
                from ultralytics import YOLO
                _yolo_model = YOLO('yolov8n.pt')
    return _yolo_model
