"""
Enhanced reasoning service for spatial navigation.
Uses DISTANCE only to determine obstacles. No hardcoded object lists.
"""

import os
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# Try to import Gemini
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️ google-generativeai not installed. Using rule-based reasoning only.")


class ObstacleClassifier:
    """
    Classifies any detected object as an obstacle if it blocks the path.
    """
    
    # Distance thresholds in meters
    DANGER_DISTANCE = 1.0    # Very close - stop!
    WARNING_DISTANCE = 2.0   # Getting close - caution
    CAUTION_DISTANCE = 3.5   # Be aware (increased to be more sensitive)
    
    def __init__(self):
        self.model = None
        
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    genai.configure(api_key=api_key)
                    self.model = genai.GenerativeModel('gemini-1.5-flash')
                    print("✓ Gemini reasoning enabled")
                except Exception as e:
                    print(f"⚠️ Gemini init failed: {e}")
            else:
                print("⚠️ GOOGLE_GEMINI_API_KEY not configured - using rule-based reasoning")
    
    def get_position(self, center_x: float, frame_width: int = 640) -> str:
        """Determine if object is left, center, or right."""
        if center_x < frame_width * 0.3: # Slightly wider center
            return "left"
        elif center_x > frame_width * 0.7:
            return "right"
        else:
            return "center"
    
    def estimate_distance_from_y(self, y: float, frame_height: int = 480) -> float:
        """
        Estimate distance based on vertical position.
        Lower in frame (higher Y) = closer.
        """
        y_ratio = y / frame_height
        
        # Heuristic mapping for a typical phone camera height
        if y_ratio > 0.8: return 0.7   # Very close (feet area)
        if y_ratio > 0.6: return 1.5   # In front
        if y_ratio > 0.4: return 2.5   # A few steps away
        if y_ratio > 0.2: return 4.0   # Background
        return 6.0                     # Distant background
    
    def get_effective_distance(self, detection: Dict[str, Any]) -> float:
        """Get distance - use depth data or Y-position proxy."""
        distance = detection.get("distance")
        
        # Use real depth if available and sane
        if distance is not None and 0 < distance < 50:
            return distance
            
        # Fallback to Y-position (bottom of bounding box)
        bbox = detection.get("bbox", [0, 0, 0, 0])
        bottom_y = bbox[3] if len(bbox) >= 4 else 240
        return self.estimate_distance_from_y(bottom_y)
    
    def is_blocking_path(self, detection: Dict[str, Any]) -> bool:
        """
        Any object is an obstacle if it's in the path and close.
        """
        center = detection.get("center", [320, 240])
        cx = center[0] if isinstance(center, (list, tuple)) else 320
        
        # Horizontally within middle 40% of frame (match get_position center)
        # 30% (192) to 70% (448) of 640 width
        in_path = cx > 192 and cx < 448 
        
        # Within caution distance
        distance = self.get_effective_distance(detection)
        
        return in_path and distance < self.CAUTION_DISTANCE
    
    def classify_all(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Add spatial metadata to all detections."""
        results = []
        for d in detections:
            dist = self.get_effective_distance(d)
            center = d.get("center", [320, 240])
            cx = center[0] if isinstance(center, (list, tuple)) else 320
            
            results.append({
                **d,
                "distance": dist, # Overwrite with effective distance for UI
                "position": self.get_position(cx),
                "is_blocking_path": self.is_blocking_path(d),
                "threat_level": self.get_threat_level(dist)
            })
        return results
        
    def get_threat_level(self, dist: float) -> str:
        if dist < self.DANGER_DISTANCE: return "danger"
        if dist < self.WARNING_DISTANCE: return "warning"
        if dist < self.CAUTION_DISTANCE: return "caution"
        return "safe"

    def generate_navigation_instruction(self, detections: List[Dict[str, Any]]) -> str:
        """
        Generate instructions focusing purely on distance/path.
        """
        if not detections:
            return "The path ahead is clear. You may proceed."
            
        classified = self.classify_all(detections)
        blocking = [d for d in classified if d["is_blocking_path"]]
        
        if not blocking:
            return "The path ahead is clear. You may proceed."
            
        # Sort by proximity
        blocking.sort(key=lambda x: x["distance"])
        closest = blocking[0]
        label = closest.get("label", "object")
        dist = closest["distance"]
        
        # Suggest direction based on where the center of the obstacle is
        cx = closest.get("center", [320, 240])[0]
        if cx < 320:
            suggestion = "Step to your right."
        else:
            suggestion = "Step to your left."
            
        if dist < self.DANGER_DISTANCE:
            return f"Stop! There is a {label} directly in your path. {suggestion}"
        elif dist < self.WARNING_DISTANCE:
            return f"Caution, {label} ahead. {suggestion}"
        else:
            return f"I see a {label} in your path about {dist:.0f} meters away. {suggestion}"

    async def reason_with_gemini(self, detections: List[Dict[str, Any]], image_data: Any = None) -> str:
        """
        Use Gemini's MULTIMODAL capabilities (Vision + Text).
        Sends the actual image to the model for "human-like" scene understanding.
        """
        if not self.model:
            return self.generate_navigation_instruction(detections)
            
        # If we have an image, use visual reasoning (much smarter)
        if image_data:
            # Prepare text context with hard distance numbers
            classified = self.classify_all(detections)
            relevant = [d for d in classified if d["distance"] < 8.0]
            scene_desc = []
            for d in relevant:
                label = d.get("label", "object")
                dist = d.get("distance", 0)
                pos = d.get("position", "unknown")
                scene_desc.append(f"- {label} at {dist:.1f}m ({pos})")
            
            context_str = "\n".join(scene_desc)

            prompt = f"""
You are a friendly sighted guide walking with a blind friend. 
I have detected these objects (approximate):
{context_str}

Analyze the IMAGE + DATA to provide exact navigation.

1. **Gap Analysis**: Is there space to the left or right of obstacles?
2. **Instruction**: Give a compound command if needed (e.g., "Step 2 steps right to avoid the bag at 2m, then walk forward").
3. **Be Specific**: Mention the obstacle you are avoiding.

Rules:
- Be concise (max 25 words).
- If clear: "Path clear. Walk X steps."
- If blocked but bypassable: "Step Left/Right X steps, then forward Y steps."
- Stop only if completely blocked or dangerous (stairs/drop-offs).
"""
            try:
                # Determine image format (assuming PIL Image or bytes)
                content = [prompt, image_data]
                response = self.model.generate_content(content)
                return response.text.strip()
            except Exception as e:
                print(f"⚠️ Gemini Visual reasoning failed: {e}")
                # Fallback to bounding box logic if visual fails
        
        # Fallback: Text-only reasoning using detection list
        classified = self.classify_all(detections)
        relevant = [d for d in classified if d["distance"] < 5.0]
        
        if not relevant:
            return "The path ahead is clear. You may proceed."
            
        scene_desc = []
        for d in relevant:
            label = d.get("label", "object")
            dist = d.get("distance", 0)
            pos = d.get("position", "unknown")
            scene_desc.append(f"- {label}: {pos}, {dist:.1f}m away")
            
        scene_text = "\n".join(scene_desc)
        prompt_text = f"""Guiding a blind person. Scene objects:\n{scene_text}\n\nTask: Can they walk forward? Give strict command (Stop/Go/Turn). Max 15 words."""

        try:
            response = self.model.generate_content(prompt_text)
            return response.text.strip()
        except Exception as e:
            print(f"⚠️ Gemini Text reasoning failed: {e}")
            return self.generate_navigation_instruction(detections)

# Singleton
_classifier: Optional[ObstacleClassifier] = None

def get_classifier() -> ObstacleClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ObstacleClassifier()
    return _classifier
