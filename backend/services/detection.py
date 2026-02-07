"""
Object detection service using YOLOv8.
Detects indoor obstacles: desks, chairs, people, doors, bags, etc.

Performance notes:
  - to_dict() eagerly converts all values to native Python types so
    downstream code never needs _make_json_serializable().
  - draw_detections() draws IN-PLACE on the supplied frame
    (no frame.copy()) to avoid a full-frame allocation per call.
"""

import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class DetectedObject:
    """Represents a detected object with bounding box."""
    label: str
    confidence: float
    bbox: tuple          # (x1, y1, x2, y2) — native ints
    center: tuple        # (cx, cy) — native ints
    distance: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Return a plain-Python dict (no numpy types → JSON-safe)."""
        return {
            "label": self.label,
            "confidence": round(float(self.confidence), 2),
            "bbox": tuple(int(v) for v in self.bbox),
            "center": tuple(int(v) for v in self.center),
            "distance": round(float(self.distance), 2) if self.distance is not None else None,
        }


class ObjectDetector:
    """
    YOLOv8-based object detector optimised for indoor navigation.
    """

    INDOOR_CLASSES = {
        0: "person", 56: "chair", 57: "couch", 58: "potted plant",
        59: "bed", 60: "dining table", 61: "toilet", 62: "tv",
        63: "laptop", 64: "mouse", 66: "keyboard", 67: "cell phone",
        73: "book", 74: "clock", 75: "vase", 24: "backpack",
        25: "umbrella", 26: "handbag", 27: "tie", 28: "suitcase",
    }

    def __init__(self, model_size: str = "n", confidence_threshold: float = 0.4):
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.model_size = model_size

    def load_model(self):
        try:
            from ultralytics import YOLO
            self.model = YOLO(f"yolov8{self.model_size}.pt")
            print(f"✓ YOLOv8{self.model_size} model loaded successfully")
        except Exception as e:
            print(f"✗ Failed to load YOLO model: {e}")
            raise

    def detect(self, frame: np.ndarray) -> List[DetectedObject]:
        if self.model is None:
            self.load_model()

        results = self.model(frame, conf=self.confidence_threshold, verbose=False)

        detections: List[DetectedObject] = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = (int(v) for v in box.xyxy[0].tolist())
                label = self.model.names[class_id]

                detections.append(DetectedObject(
                    label=label,
                    confidence=confidence,
                    bbox=(x1, y1, x2, y2),
                    center=((x1 + x2) // 2, (y1 + y2) // 2),
                ))

        # Keep top-5 by confidence (already fast — 5 is tiny)
        if len(detections) > 5:
            detections.sort(key=lambda x: x.confidence, reverse=True)
            detections = detections[:5]
        return detections

    def detect_from_bytes(self, image_bytes: bytes) -> List[DetectedObject]:
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return self.detect(frame)

    def draw_detections(
        self,
        frame: np.ndarray,
        detections: List[DetectedObject],
        *,
        copy: bool = False,
    ) -> np.ndarray:
        """
        Draw bounding boxes on *frame*.

        By default draws IN-PLACE (no allocation).  Pass ``copy=True``
        if you need the original frame preserved (e.g. for the /detect endpoint).
        """
        out = frame.copy() if copy else frame

        for det in detections:
            x1, y1, x2, y2 = det.bbox

            if det.distance is not None:
                if det.distance < 1.0:
                    color = (0, 0, 255)
                elif det.distance < 2.0:
                    color = (0, 165, 255)
                else:
                    color = (0, 255, 0)
            else:
                color = (255, 200, 0)

            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)

            label_text = (
                f"{det.label}: {det.distance:.1f}m"
                if det.distance is not None
                else f"{det.label}: {det.confidence:.0%}"
            )
            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
            cv2.rectangle(out, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
            cv2.putText(out, label_text, (x1 + 2, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)

        return out


# Singleton
_detector: Optional[ObjectDetector] = None

def get_detector() -> ObjectDetector:
    global _detector
    if _detector is None:
        _detector = ObjectDetector(model_size="n")
        _detector.load_model()
    return _detector
