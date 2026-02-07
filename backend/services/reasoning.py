"""
Enhanced reasoning service for spatial navigation.
Uses DISTANCE only to determine obstacles. No hardcoded object lists.
"""

import os
import base64
import io
import asyncio
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# ── Retry helper ──
GEMINI_TIMEOUT_S = 12.0
GEMINI_MAX_RETRIES = 2

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
    Classifies detected objects as obstacles using bounding-box coverage
    of the walking corridor, not just the object's centre point.
    """

    # Distance thresholds in meters
    DANGER_DISTANCE  = 1.0   # Very close — stop!
    WARNING_DISTANCE = 2.0   # Getting close — caution
    CAUTION_DISTANCE = 3.5   # Be aware

    # Walking corridor = centre 40 % of the frame (30 %–70 %)
    CORRIDOR_LEFT_PCT  = 0.30
    CORRIDOR_RIGHT_PCT = 0.70

    # Minimum corridor-coverage ratios to be considered "blocking"
    # Varies by distance — farther objects need to cover MORE of the
    # corridor because the user still has room to adjust.
    BLOCK_THRESHOLD_DANGER  = 0.25   # < 1 m  — 25 % coverage = blocking
    BLOCK_THRESHOLD_WARNING = 0.35   # 1–2 m  — 35 %
    BLOCK_THRESHOLD_CAUTION = 0.50   # 2–3.5m — 50 %

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
                print("⚠️ GOOGLE_GEMINI_API_KEY not configured — using rule-based reasoning")

    # ───────────────────── helpers ─────────────────────

    def get_position(self, center_x: float, frame_width: int = 640) -> str:
        """Determine if object is left, centre, or right."""
        if center_x < frame_width * self.CORRIDOR_LEFT_PCT:
            return "left"
        elif center_x > frame_width * self.CORRIDOR_RIGHT_PCT:
            return "right"
        return "center"

    def estimate_distance_from_y(self, y: float, frame_height: int = 480) -> float:
        """Estimate distance based on vertical position (lower = closer)."""
        y_ratio = y / frame_height
        if y_ratio > 0.8: return 0.7
        if y_ratio > 0.6: return 1.5
        if y_ratio > 0.4: return 2.5
        if y_ratio > 0.2: return 4.0
        return 6.0

    def get_effective_distance(self, detection: Dict[str, Any]) -> float:
        """Get distance — use depth data or Y-position proxy."""
        distance = detection.get("distance")
        if distance is not None and 0 < distance < 50:
            return distance
        bbox = detection.get("bbox", [0, 0, 0, 0])
        bottom_y = bbox[3] if len(bbox) >= 4 else 240
        return self.estimate_distance_from_y(bottom_y)

    # ───────────── corridor-coverage logic ──────────────

    def get_corridor_coverage(
        self, detection: Dict[str, Any], frame_width: int = 640
    ) -> float:
        """
        What fraction (0.0 – 1.0) of the walking corridor does this
        object's bounding box overlap?
        """
        bbox = detection.get("bbox", [0, 0, 0, 0])
        if len(bbox) < 4:
            return 0.0

        obj_left  = bbox[0]
        obj_right = bbox[2]

        corr_left  = frame_width * self.CORRIDOR_LEFT_PCT
        corr_right = frame_width * self.CORRIDOR_RIGHT_PCT
        corr_width = corr_right - corr_left

        overlap = max(0.0, min(obj_right, corr_right) - max(obj_left, corr_left))
        return overlap / corr_width if corr_width > 0 else 0.0

    def get_clear_side(
        self, detection: Dict[str, Any], frame_width: int = 640
    ) -> Optional[str]:
        """
        Return 'left' or 'right' indicating which side of the corridor
        has MORE open space, or None if the object is not in the corridor.
        """
        bbox = detection.get("bbox", [0, 0, 0, 0])
        if len(bbox) < 4:
            return None

        obj_left  = bbox[0]
        obj_right = bbox[2]

        corr_left  = frame_width * self.CORRIDOR_LEFT_PCT
        corr_right = frame_width * self.CORRIDOR_RIGHT_PCT

        # Free space on the left/right side of the corridor
        free_left  = max(0.0, min(obj_left, corr_right) - corr_left)
        free_right = max(0.0, corr_right - max(obj_right, corr_left))

        if free_left >= free_right:
            return "left"
        return "right"

    def is_blocking_path(self, detection: Dict[str, Any]) -> bool:
        """
        An object blocks the path only when its bounding box covers
        enough of the walking corridor AND it is close enough.
        """
        distance = self.get_effective_distance(detection)
        if distance >= self.CAUTION_DISTANCE:
            return False

        coverage = self.get_corridor_coverage(detection)

        if distance < self.DANGER_DISTANCE:
            return coverage >= self.BLOCK_THRESHOLD_DANGER
        if distance < self.WARNING_DISTANCE:
            return coverage >= self.BLOCK_THRESHOLD_WARNING
        return coverage >= self.BLOCK_THRESHOLD_CAUTION

    # ───────────────── classification ──────────────────

    def classify_all(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Add spatial metadata to all detections."""
        results = []
        for d in detections:
            dist = self.get_effective_distance(d)
            center = d.get("center", [320, 240])
            cx = center[0] if isinstance(center, (list, tuple)) else 320

            results.append({
                **d,
                "distance": dist,
                "position": self.get_position(cx),
                "corridor_coverage": round(self.get_corridor_coverage(d), 2),
                "is_blocking_path": self.is_blocking_path(d),
                "threat_level": self.get_threat_level(dist),
            })
        return results

    def get_threat_level(self, dist: float) -> str:
        if dist < self.DANGER_DISTANCE:  return "danger"
        if dist < self.WARNING_DISTANCE: return "warning"
        if dist < self.CAUTION_DISTANCE: return "caution"
        return "safe"

    # ─────────── navigation instruction (rule-based) ───────────

    def generate_navigation_instruction(self, detections: List[Dict[str, Any]]) -> str:
        """
        Generate a concise verbal instruction.

        Key improvement: uses bounding-box corridor coverage so objects
        that only partially overlap the walking path don't trigger
        unnecessary "step left / step right" commands.
        """
        if not detections:
            return "Path clear. Walk forward."

        classified = self.classify_all(detections)
        blocking   = [d for d in classified if d["is_blocking_path"]]

        # ── Nothing truly blocking ──
        if not blocking:
            # Mention nearby objects for awareness, but affirm clear path
            nearby = [
                d for d in classified
                if d["distance"] < self.CAUTION_DISTANCE
                and d.get("corridor_coverage", 0) > 0.05
            ]
            if nearby:
                closest = min(nearby, key=lambda x: x["distance"])
                label = closest.get("label", "object")
                pos   = closest.get("position", "side")
                return f"{label} on your {pos}, but path is clear. Continue forward."
            return "Path clear. Walk forward."

        # ── Something IS blocking ──
        blocking.sort(key=lambda x: x["distance"])
        closest  = blocking[0]
        label    = closest.get("label", "object")
        dist     = closest["distance"]
        coverage = closest.get("corridor_coverage", 1.0)

        # Determine which side is clear
        clear_side = self.get_clear_side(closest)
        if clear_side == "left":
            side_instruction = "Pass on your left."
        elif clear_side == "right":
            side_instruction = "Pass on your right."
        else:
            side_instruction = "Step aside."

        # ── Partially blocking (coverage 25-60 %) — room to squeeze past ──
        if coverage < 0.60:
            if dist < self.DANGER_DISTANCE:
                return f"Caution, {label} close ahead. {side_instruction}"
            return f"{label} partially ahead. {side_instruction}"

        # ── Heavily blocking (coverage ≥ 60 %) — need to step around ──
        if dist < self.DANGER_DISTANCE:
            return (
                f"Stop. {label} blocking your path. "
                f"Take 2 steps to your {clear_side or 'right'}."
            )
        elif dist < self.WARNING_DISTANCE:
            return (
                f"Caution. {label} ahead, about {dist:.0f} meter. "
                f"Step to your {clear_side or 'right'}."
            )
        return (
            f"{label} in your path, about {dist:.0f} meters. "
            f"Move to your {clear_side or 'right'}."
        )

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
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.models.generate_content,
                    model=self.model_name,
                    contents=prompt,
                ),
                timeout=GEMINI_TIMEOUT_S,
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
            # Prepare text context with hard distance numbers + corridor coverage
            classified = self.classify_all(detections)
            relevant = [d for d in classified if d["distance"] < 8.0]
            scene_desc = []
            for d in relevant:
                label    = d.get("label", "object")
                dist     = d.get("distance", 0)
                pos      = d.get("position", "unknown")
                cov      = d.get("corridor_coverage", 0)
                blocking = d.get("is_blocking_path", False)
                scene_desc.append(
                    f"- {label} at {dist:.1f}m ({pos}), "
                    f"covers {cov*100:.0f}% of walking path, "
                    f"{'BLOCKING' if blocking else 'not blocking'}"
                )

            context_str = "\n".join(scene_desc) if scene_desc else "No objects detected."

            prompt = f"""
You are a sighted guide speaking to a blind person. They will hear your words only (no screen).
Navigation goal: {navigation_context}

Detected objects (approximate distances and path coverage):
{context_str}

Look at the IMAGE and the data. Give ONE short verbal instruction to speak aloud.

RULES:
- CRITICAL: If an object is on the LEFT or RIGHT side and covers LESS THAN 50% of the walking path, the user has enough room to walk. Say "Path is clear" or "{label} on your left/right, keep walking." Do NOT tell them to step aside when there is room.
- Only tell the user to step left/right when an object covers MORE THAN 50% of the walking path and is within 2 meters.
- If the path IS blocked: say which way to move, e.g. "Chair ahead. Pass on your left."
- If the path is clear: say "Path clear. Walk forward." or "Nothing ahead. Continue straight."
- Maximum 20 words. No "you may" or "I suggest" — give a direct command.
- Do not mention percentages, the map, the screen, or anything visual. Only verbal directions.
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
                
                last_err = None
                for attempt in range(GEMINI_MAX_RETRIES + 1):
                    try:
                        response = await asyncio.wait_for(
                            asyncio.to_thread(
                                self.client.models.generate_content,
                                model=self.model_name,
                                contents=[prompt, image_part],
                            ),
                            timeout=GEMINI_TIMEOUT_S,
                        )
                        return response.text.strip()
                    except (asyncio.TimeoutError, Exception) as retry_err:
                        last_err = retry_err
                        if attempt < GEMINI_MAX_RETRIES:
                            await asyncio.sleep(0.5 * (2 ** attempt))
                print(f"⚠️ Gemini Visual reasoning failed after retries: {last_err}")
                return self.generate_navigation_instruction(detections)
            except Exception as e:
                print(f"⚠️ Gemini Visual reasoning failed (Rate Limit?): {e}")
                # FALLBACK to rule-based logic immediately
                return self.generate_navigation_instruction(detections)
        
        # Fallback: Text-only reasoning
        classified = self.classify_all(detections)
        relevant = [d for d in classified if d["distance"] < 5.0]

        if not relevant:
            result = "Path clear. Walk forward."
            if navigation_context:
                result += f" {navigation_context}"
            return result

        scene_desc = []
        for d in relevant:
            label    = d.get("label", "object")
            dist     = d.get("distance", 0)
            pos      = d.get("position", "unknown")
            cov      = d.get("corridor_coverage", 0)
            blocking = d.get("is_blocking_path", False)
            scene_desc.append(
                f"- {label}: {pos}, {dist:.1f}m, "
                f"covers {cov*100:.0f}% of path, "
                f"{'BLOCKING' if blocking else 'not blocking'}"
            )

        scene_text = "\n".join(scene_desc)
        prompt_text = (
            f"You are speaking to a blind person. Goal: {navigation_context}\n"
            f"Scene:\n{scene_text}\n\n"
            f"IMPORTANT: Only tell the user to step aside when an object covers >50% of the path AND is within 2m. "
            f"If the object is on the side or covers little of the path, say 'Path clear, walk forward' "
            f"or mention the object but tell them to keep walking. Max 15 words."
        )

        last_err = None
        for attempt in range(GEMINI_MAX_RETRIES + 1):
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.models.generate_content,
                        model=self.model_name,
                        contents=prompt_text,
                    ),
                    timeout=GEMINI_TIMEOUT_S,
                )
                return response.text.strip()
            except (asyncio.TimeoutError, Exception) as retry_err:
                last_err = retry_err
                if attempt < GEMINI_MAX_RETRIES:
                    await asyncio.sleep(0.5 * (2 ** attempt))
        print(f"⚠️ Gemini Text reasoning failed after retries: {last_err}")
        return self.generate_navigation_instruction(detections)

# Singleton
_classifier: Optional[ObstacleClassifier] = None

def get_classifier() -> ObstacleClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ObstacleClassifier()
    return _classifier
