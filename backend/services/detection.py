"""
Object detection service using YOLOv8.
Detects indoor obstacles: desks, chairs, people, doors, bags, etc.
Returns bounding boxes and class labels for visualization.
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
    bbox: tuple  # (x1, y1, x2, y2)
    center: tuple  # (cx, cy)
    distance: Optional[float] = None  # meters, set by depth estimation
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 2),
            "bbox": self.bbox,
            "center": self.center,
            "distance": round(self.distance, 2) if self.distance else None,
        }


class ObjectDetector:
    """
    YOLOv8-based object detector optimized for indoor navigation.
    Uses COCO-trained model which detects 80 common object classes.
    """
    
    # Indoor-relevant COCO classes
    INDOOR_CLASSES = {
        0: "person",
        56: "chair",
        57: "couch",
        58: "potted plant",
        59: "bed",
        60: "dining table",
        61: "toilet",
        62: "tv",
        63: "laptop",
        64: "mouse",
        66: "keyboard",
        67: "cell phone",
        73: "book",
        74: "clock",
        75: "vase",
        24: "backpack",
        25: "umbrella",
        26: "handbag",
        27: "tie",
        28: "suitcase",
    }
    
    def __init__(self, model_size: str = "n", confidence_threshold: float = 0.4):
        """
        Initialize YOLOv8 detector.
        
        Args:
            model_size: 'n' (nano/fast), 's' (small), 'm' (medium), 'l' (large)
            confidence_threshold: Minimum confidence to report detection
        """
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.model_size = model_size
        
    def load_model(self):
        """Load YOLOv8 model. Call this once at startup."""
        try:
            from ultralytics import YOLO
            # Use YOLOv8 nano for fastest inference on CPU/mobile
            self.model = YOLO(f"yolov8{self.model_size}.pt")
            print(f"✓ YOLOv8{self.model_size} model loaded successfully")
        except Exception as e:
            print(f"✗ Failed to load YOLO model: {e}")
            raise
    
    def detect(self, frame: np.ndarray) -> List[DetectedObject]:
        """
        Detect objects in a frame.
        
        Args:
            frame: BGR image as numpy array (from OpenCV)
            
        Returns:
            List of DetectedObject instances
        """
        if self.model is None:
            self.load_model()
        
        # Run inference
        results = self.model(frame, conf=self.confidence_threshold, verbose=False)
        
        detections = []
        for result in results:
            boxes = result.boxes
            for i, box in enumerate(boxes):
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                # Get bounding box coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                
                # Get class name
                label = self.model.names[class_id]
                
                detections.append(DetectedObject(
                    label=label,
                    confidence=confidence,
                    bbox=(x1, y1, x2, y2),
                    center=(cx, cy),
                ))
        
        # Optimization: Sort by confidence and limit to top 5
        # This keeps the video feed smoother even with many objects
        detections.sort(key=lambda x: x.confidence, reverse=True)
        return detections[:5]
    
    def detect_from_bytes(self, image_bytes: bytes) -> List[DetectedObject]:
        """Detect objects from raw image bytes (e.g., from HTTP request)."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return self.detect(frame)
    
    def draw_detections(self, frame: np.ndarray, detections: List[DetectedObject]) -> np.ndarray:
        """
        Draw bounding boxes and labels on frame.
        
        Args:
            frame: Original BGR image
            detections: List of DetectedObject from detect()
            
        Returns:
            Frame with bounding boxes drawn
        """
        annotated = frame.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det.bbox
            
            # Color based on distance (if available)
            if det.distance is not None:
                if det.distance < 1.0:
                    color = (0, 0, 255)  # Red - very close
                elif det.distance < 2.0:
                    color = (0, 165, 255)  # Orange - close
                else:
                    color = (0, 255, 0)  # Green - safe
            else:
                color = (255, 200, 0)  # Cyan - no distance info
            
            # Draw box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            
            # Create label text
            if det.distance is not None:
                label_text = f"{det.label}: {det.distance:.1f}m"
            else:
                label_text = f"{det.label}: {det.confidence:.0%}"
            
            # Draw label background
            (text_w, text_h), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
            cv2.rectangle(annotated, (x1, y1 - text_h - 8), (x1 + text_w + 4, y1), color, -1)
            
            # Draw label text
            cv2.putText(annotated, label_text, (x1 + 2, y1 - 4),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        
        return annotated


# Singleton detector instance
_detector: Optional[ObjectDetector] = None


def get_detector() -> ObjectDetector:
    """Get or create the singleton detector instance."""
    global _detector
    if _detector is None:
        _detector = ObjectDetector(model_size="n")  # Use nano for speed
        _detector.load_model()
    return _detector
