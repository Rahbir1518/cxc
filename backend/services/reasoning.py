"""
Enhanced reasoning service for spatial navigation.
Uses DISTANCE only to determine obstacles. No hardcoded object lists.
"""

import os
import base64
import io
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# Try to import new google-genai SDK (preferred over deprecated google.generativeai)
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️ google-genai not installed. Run: pip install google-genai")


class ObstacleClassifier:
    """
    Classifies any detected object as an obstacle if it blocks the path.
    """
    
    # Distance thresholds in meters
    DANGER_DISTANCE = 1.0    # Very close - stop!
    WARNING_DISTANCE = 2.0   # Getting close - caution
    CAUTION_DISTANCE = 3.5   # Be aware (increased to be more sensitive)
    
    def __init__(self):
        self.client = None
        self.model_name = "gemini-2.0-flash"  # Use latest model
        
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    self.client = genai.Client(api_key=api_key)
                    # Test the model
                    test_response = self.client.models.generate_content(
                        model=self.model_name,
                        contents="test"
                    )
                    print(f"✓ Gemini reasoning enabled ({self.model_name})")
                except Exception as e:
                    print(f"⚠️ Gemini init failed: {e}")
                    self.client = None
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
            return f"Stop. There is a {label} in your path. {suggestion} Take 2 or 3 steps."
        elif dist < self.WARNING_DISTANCE:
            return f"Caution. {label} ahead. {suggestion}"
        else:
            return f"{label} in your path, about {dist:.0f} meters. {suggestion}"

    async def get_navigation_intent(self, user_text: str) -> Dict[str, Any]:
        """
        Use Gemini to parse user navigation intent with Regex fallback.
        Example: "I want to go to room 0010" -> {"destination": "0010"}
        """
        # 1. Regex Fallback (Fast & Reliable for room numbers/labels)
        import re
        # Look for "room XXXX" or just "XXXX" where X is a digit
        # Matches "room 0010", "0010", "room ten" (if digit provided)
        room_match = re.search(r'room\s*(\w+)', user_text.lower())
        if room_match:
            dest = room_match.group(1)
            # Basic validation: ensure it's either room_XXXX format or just XXXX
            if dest.isdigit() or dest.startswith('00'):
                return {"destination": dest}
        
        # General digit search (e.g., "go to 0010")
        digits = re.findall(r'\b\d{4}\b', user_text) # Look for 4-digit room numbers
        if digits:
            return {"destination": digits[0]}

        # 2. Gemini LLM Parsing
        if not self.client:
            return {"destination": None, "error": "Gemini not available"}

        prompt = f"""
        You are an indoor navigation assistant.
        A user says: "{user_text}"
        
        Extract the destination room number or name.
        Return ONLY a JSON object with a "destination" key.
        If no destination is found, return {{"destination": null}}.
        """
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            text = response.text.strip()
            # Clean up potential markdown formatting
            if "```" in text:
                text = text.split("```")[1].replace("json", "").strip()
            
            import json
            return json.loads(text)
        except Exception as e:
            print(f"⚠️ Intent parsing failed (Rate Limit or Network): {e}")
            # Final fallback: if Gemini fails, try any digit sequence in text
            any_digits = re.search(r'(\d+)', user_text)
            if any_digits:
                return {"destination": any_digits.group(1)}
            return {"destination": None}

    async def reason_with_gemini(self, detections: List[Dict[str, Any]], image_data: Any = None, navigation_context: str = "") -> str:
        """
        Use Gemini's MULTIMODAL capabilities (Vision + Text).
        Sends the actual image to the model for "human-like" scene understanding.
        """
        # Always fallback to rule-based if client is not enabled or if previous calls failed freqently
        if not self.client:
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
You are a sighted guide speaking to a blind person. They will hear your words only (no screen).
Navigation goal: {navigation_context}

Detected objects (approximate distances):
{context_str}

Look at the IMAGE and the data. Give ONE short verbal instruction to speak aloud.

RULES:
- Say exactly what to do: use "Take 2 steps left" or "Take 3 steps right" or "Step left to avoid the chair" etc. Give a number of steps when you can (1, 2, or 3 steps).
- If the path is clear: say "Path is clear. Walk forward." or "Nothing in your way. Continue straight."
- If something is in the way: say which way to move and how many steps, e.g. "There is a chair in front of you. Take 2 steps to your left, then continue."
- Maximum 20 words. No "you may" or "I suggest" — give a direct command.
- Do not mention the map, the screen, or anything visual. Only verbal directions.
"""
            try:
                # Convert PIL Image to base64 for the new google-genai API
                img_buffer = io.BytesIO()
                image_data.save(img_buffer, format='JPEG')
                img_bytes = img_buffer.getvalue()
                
                # Create image part using the new types format
                image_part = types.Part.from_bytes(
                    data=img_bytes,
                    mime_type="image/jpeg"
                )
                
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=[prompt, image_part]
                )
                return response.text.strip()
            except Exception as e:
                print(f"⚠️ Gemini Visual reasoning failed (Rate Limit?): {e}")
                # FALLBACK to rule-based logic immediately
                return self.generate_navigation_instruction(detections)
        
        # Fallback: Text-only reasoning
        classified = self.classify_all(detections)
        relevant = [d for d in classified if d["distance"] < 5.0]
        
        if not relevant:
            result = "The path ahead is clear."
            if navigation_context:
                result += f" {navigation_context}"
            return result
            
        scene_desc = []
        for d in relevant:
            label = d.get("label", "object")
            dist = d.get("distance", 0)
            pos = d.get("position", "unknown")
            scene_desc.append(f"- {label}: {pos}, {dist:.1f}m away")
            
        scene_text = "\n".join(scene_desc)
        prompt_text = f"You are speaking to a blind person. Goal: {navigation_context}\nScene:\n{scene_text}\n\nReply with one short verbal command: say 'Take X steps left' or 'Take X steps right' if blocked, or 'Path clear, walk forward' if clear. Max 15 words."

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt_text
            )
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
