import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class DispatchTracker:
    """
    Thread-safe in-memory store for active field staff live locations during dispatch.
    Expires locations after timeout_seconds if no new heartbeat arrives.
    """
    def __init__(self, timeout_seconds: int = 90):
        self._lock = threading.Lock()
        self._timeout_seconds = timeout_seconds
        self._locations: Dict[int, Dict[str, Any]] = {}

    def update_location(
        self,
        report_id: int,
        user_id: int,
        responder_name: str,
        latitude: float,
        longitude: float,
        accuracy: Optional[float] = None,
        heading: Optional[float] = None,
        speed: Optional[float] = None,
        rescue_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            record = {
                "report_id": report_id,
                "rescue_id": rescue_id,
                "user_id": user_id,
                "responder_name": responder_name,
                "latitude": float(latitude),
                "longitude": float(longitude),
                "accuracy": float(accuracy) if accuracy is not None else None,
                "heading": float(heading) if heading is not None else None,
                "speed": float(speed) if speed is not None else None,
                "updated_at": datetime.now(timezone.utc),
                "is_active": True,
            }
            self._locations[report_id] = record
            return dict(record)

    def get_location(self, report_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            record = self._locations.get(report_id)
            if not record:
                return None

            now = datetime.now(timezone.utc)
            updated_at = record.get("updated_at")
            is_active = True
            if updated_at:
                diff = (now - updated_at).total_seconds()
                if diff > self._timeout_seconds:
                    is_active = False

            res = dict(record)
            res["is_active"] = is_active
            return res

    def stop_location(self, report_id: int) -> bool:
        with self._lock:
            if report_id in self._locations:
                self._locations.pop(report_id, None)
                return True
            return False

    def clear_all(self) -> None:
        with self._lock:
            self._locations.clear()


dispatch_tracker = DispatchTracker(timeout_seconds=90)

