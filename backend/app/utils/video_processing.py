import io
import os
import tempfile
from typing import List, Optional, Tuple
from PIL import Image

try:
    import cv2
except ImportError:
    cv2 = None

VIDEO_EXTS = {'.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'}


def is_video_content(filename: str = "", content_type: str = "", file_bytes: bytes = b"") -> bool:
    """Detect whether a file is a video based on filename, mime type, or header magic bytes."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in VIDEO_EXTS:
        return True

    mime = (content_type or "").lower()
    if mime.startswith("video/"):
        return True

    if len(file_bytes) >= 12:
        # Check MP4 / MOV (ftyp box in first 12 bytes)
        if file_bytes[4:8] == b'ftyp':
            return True
        # Check WebM / MKV (EBML ID \x1a\x45\xdf\xa3)
        if file_bytes.startswith(b'\x1a\x45\xdf\xa3'):
            return True
        # Check AVI (RIFF....AVI)
        if file_bytes.startswith(b'RIFF') and file_bytes[8:12] == b'AVI ':
            return True

    return False


def extract_sample_frames(video_bytes: bytes, max_samples: int = 8) -> List[Image.Image]:
    """
    Extract evenly distributed RGB PIL Images from raw video bytes using OpenCV.
    """
    if cv2 is None or not video_bytes:
        return []

    frames: List[Image.Image] = []
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            # Fallback for streams without frame count metadata: read sequentially
            count = 0
            while count < max_samples:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(Image.fromarray(rgb_frame))
                count += 1
            cap.release()
            return frames

        # Pick sample positions spaced across the video duration
        if total_frames <= max_samples:
            frame_indices = list(range(total_frames))
        else:
            step = max(1, total_frames // (max_samples + 1))
            frame_indices = [step * (i + 1) for i in range(max_samples) if step * (i + 1) < total_frames]

        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret and frame is not None:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(Image.fromarray(rgb_frame))

        cap.release()
    except Exception as err:
        print(f"Error in extract_sample_frames: {err}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return frames


def analyze_video_frames(
    frames: List[Image.Image],
    yolo_model=None
) -> Tuple[Optional[Image.Image], List[str], List[List[float]], int]:
    """
    Evaluate sample frames with YOLOv8 to find the best frame containing an animal.
    
    Returns:
        (best_frame, detected_labels, detected_boxes, yolo_detection_count)
    """
    if not frames:
        return None, [], [], 0

    best_frame = None
    best_labels: List[str] = []
    best_boxes: List[List[float]] = []
    best_score = -1.0
    total_animal_detections = 0

    if yolo_model:
        for frame in frames:
            try:
                results = yolo_model(frame)
                frame_labels: List[str] = []
                frame_boxes: List[List[float]] = []
                frame_score = 0.0

                for r in results:
                    for c, box, conf in zip(r.boxes.cls, r.boxes.xyxy, r.boxes.conf):
                        label = r.names[int(c)]
                        if label.lower() in ['dog', 'cat']:
                            total_animal_detections += 1
                            lbl_cap = label.capitalize()
                            frame_labels.append(lbl_cap)
                            box_list = [float(v) for v in box]
                            frame_boxes.append(box_list)
                            
                            # Score based on confidence and box area relative to image
                            w, h = frame.size
                            box_area = (box_list[2] - box_list[0]) * (box_list[3] - box_list[1])
                            rel_area = box_area / max(1, (w * h))
                            score = float(conf) * 0.7 + min(rel_area, 0.5) * 0.6
                            if score > frame_score:
                                frame_score = score

                if frame_labels and frame_score > best_score:
                    best_score = frame_score
                    best_frame = frame
                    best_labels = frame_labels
                    best_boxes = frame_boxes
            except Exception as e:
                print(f"Error evaluating frame with YOLO: {e}")

    # If YOLO found an animal in at least one frame, return that best frame
    if best_frame is not None:
        return best_frame, best_labels, best_boxes, total_animal_detections

    # Fallback when YOLO didn't detect an animal: return the middle frame for Gemini Vision inspection
    middle_idx = len(frames) // 2
    return frames[middle_idx], [], [], 0
