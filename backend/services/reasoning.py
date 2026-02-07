"""
Enhanced reasoning service for spatial navigation.
Uses DISTANCE only to determine obstacles. No hardcoded object lists.

Performance notes (vs. previous version):
  - classify_all():  computes effective distance ONCE per detection and
    passes it to is_blocking_path() / get_threat_level() directly,
    eliminating the double-computation.
  - generate_navigation_instruction():  accepts an optional pre-classified
    list so the WS handler doesn't have to call classify_all() twice.
"""

import os
import base64
import io
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️ google-genai not installed. Run: pip install google-genai")


class ObstacleClassifier:
    DANGER_DISTANCE = 1.0
    WARNING_DISTANCE = 2.0
    CAUTION_DISTANCE = 3.5

    def __init__(self):
        self.client = None
        self.model_name = "gemini-2.0-flash"

        if GEMINI_AVAILABLE:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    self.client = genai.Client(api_key=api_key)
                    self.client.models.generate_content(
                        model=self.model_name, contents="test"
                    )
                    print(f"✓ Gemini reasoning enabled ({self.model_name})")
                except Exception as e:
                    print(f"⚠️ Gemini init failed: {e}")
                    self.client = None
            else:
                print("⚠️ GOOGLE_GEMINI_API_KEY not configured - using rule-based reasoning")

    # ── helpers (pure, no side-effects) ────────────────────────────

    @staticmethod
    def _get_position(center_x: float, frame_width: int = 640) -> str:
        if center_x < frame_width * 0.3:
            return "left"
        if center_x > frame_width * 0.7:
            return "right"
        return "center"

    @staticmethod
    def _estimate_distance_from_y(y: float, frame_height: int = 480) -> float:
        ratio = y / frame_height
        if ratio > 0.8: return 0.7
        if ratio > 0.6: return 1.5
        if ratio > 0.4: return 2.5
        if ratio > 0.2: return 4.0
        return 6.0

    @staticmethod
    def _get_effective_distance(d: Dict[str, Any]) -> float:
        dist = d.get("distance")
        if dist is not None and 0 < dist < 50:
            return float(dist)
        bbox = d.get("bbox", (0, 0, 0, 0))
        bottom_y = bbox[3] if len(bbox) >= 4 else 240
        return ObstacleClassifier._estimate_distance_from_y(bottom_y)

    @staticmethod
    def _is_blocking(cx: float, effective_dist: float) -> bool:
        in_path = 192 < cx < 448        # centre 40 % of 640-wide frame
        return in_path and effective_dist < ObstacleClassifier.CAUTION_DISTANCE

    @staticmethod
    def _threat_level(dist: float) -> str:
        if dist < ObstacleClassifier.DANGER_DISTANCE: return "danger"
        if dist < ObstacleClassifier.WARNING_DISTANCE: return "warning"
        if dist < ObstacleClassifier.CAUTION_DISTANCE: return "caution"
        return "safe"

    # ── public API ─────────────────────────────────────────────────

    def classify_all(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Add spatial metadata to every detection.
        Computes effective distance exactly ONCE per detection (was 2× before).
        Returns plain-Python dicts (JSON-safe without extra serialisation).
        """
        out: List[Dict[str, Any]] = []
        for d in detections:
            center = d.get("center", (320, 240))
            cx = float(center[0]) if isinstance(center, (list, tuple)) else 320.0
            eff_dist = self._get_effective_distance(d)

            out.append({
                "label":            d.get("label", "object"),
                "confidence":       d.get("confidence", 0),
                "bbox":             d.get("bbox", (0, 0, 0, 0)),
                "center":           d.get("center", (320, 240)),
                "distance":         round(eff_dist, 2),
                "position":         self._get_position(cx),
                "is_blocking_path": self._is_blocking(cx, eff_dist),
                "threat_level":     self._threat_level(eff_dist),
            })
        return out

    def generate_navigation_instruction(
        self,
        detections: List[Dict[str, Any]],
        *,
        pre_classified: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        Generate a short spoken instruction.

        Pass *pre_classified* (output of classify_all) to avoid re-computing
        classification.  If omitted, classify_all is called internally.
        """
        if not detections:
            return "The path ahead is clear. You may proceed."

        classified = pre_classified if pre_classified is not None else self.classify_all(detections)
        blocking = [d for d in classified if d["is_blocking_path"]]

        if not blocking:
            return "The path ahead is clear. You may proceed."

        # Closest blocker (list is tiny — max 5 items, O(n) is fine)
        closest = min(blocking, key=lambda x: x["distance"])
        label = closest.get("label", "object")
        dist = closest["distance"]

        cx = closest.get("center", (320, 240))
        cx_val = cx[0] if isinstance(cx, (list, tuple)) else 320
        suggestion = "Step to your right." if cx_val < 320 else "Step to your left."

        if dist < self.DANGER_DISTANCE:
            return f"Stop. There is a {label} in your path. {suggestion} Take 2 or 3 steps."
        if dist < self.WARNING_DISTANCE:
            return f"Caution. {label} ahead. {suggestion}"
        return f"{label} in your path, about {dist:.0f} meters. {suggestion}"

    # ── Gemini helpers (unchanged logic, kept for /analyze-and-announce) ──

    async def get_navigation_intent(self, user_text: str) -> Dict[str, Any]:
        import re
        room_match = re.search(r'room\s*(\w+)', user_text.lower())
        if room_match:
            dest = room_match.group(1)
            if dest.isdigit() or dest.startswith('00'):
                return {"destination": dest}

        digits = re.findall(r'\b\d{4}\b', user_text)
        if digits:
            return {"destination": digits[0]}

        if not self.client:
            return {"destination": None, "error": "Gemini not available"}

        prompt = (
            f'You are an indoor navigation assistant.\n'
            f'A user says: "{user_text}"\n\n'
            f'Extract the destination room number or name.\n'
            f'Return ONLY a JSON object with a "destination" key.\n'
            f'If no destination is found, return {{"destination": null}}.'
        )

        try:
            response = self.client.models.generate_content(
                model=self.model_name, contents=prompt
            )
            text = response.text.strip()
            if "```" in text:
                text = text.split("```")[1].replace("json", "").strip()
            import json
            return json.loads(text)
        except Exception as e:
            print(f"⚠️ Intent parsing failed: {e}")
            import re as _re
            any_digits = _re.search(r'(\d+)', user_text)
            if any_digits:
                return {"destination": any_digits.group(1)}
            return {"destination": None}

    async def reason_with_gemini(
        self,
        detections: List[Dict[str, Any]],
        image_data: Any = None,
        navigation_context: str = "",
    ) -> str:
        if not self.client:
            return self.generate_navigation_instruction(detections)

        if image_data:
            classified = self.classify_all(detections)
            relevant = [d for d in classified if d["distance"] < 8.0]
            context_str = "\n".join(
                f"- {d.get('label','object')} at {d.get('distance',0):.1f}m ({d.get('position','?')})"
                for d in relevant
            )
            prompt = (
                "You are a sighted guide speaking to a blind person. "
                "They will hear your words only (no screen).\n"
                f"Navigation goal: {navigation_context}\n\n"
                f"Detected objects (approximate distances):\n{context_str}\n\n"
                "Look at the IMAGE and the data. Give ONE short verbal instruction.\n\n"
                "RULES:\n"
                '- Say exactly what to do: "Take 2 steps left", "Step right to avoid the chair".\n'
                '- If clear: "Path is clear. Walk forward."\n'
                "- Maximum 20 words. Direct command only.\n"
                "- Do not mention the map or screen.\n"
            )
            try:
                img_buffer = io.BytesIO()
                image_data.save(img_buffer, format='JPEG')
                image_part = types.Part.from_bytes(
                    data=img_buffer.getvalue(), mime_type="image/jpeg"
                )
                response = self.client.models.generate_content(
                    model=self.model_name, contents=[prompt, image_part]
                )
                return response.text.strip()
            except Exception as e:
                print(f"⚠️ Gemini Visual reasoning failed: {e}")
                return self.generate_navigation_instruction(detections)

        classified = self.classify_all(detections)
        relevant = [d for d in classified if d["distance"] < 5.0]
        if not relevant:
            result = "The path ahead is clear."
            if navigation_context:
                result += f" {navigation_context}"
            return result

        scene_text = "\n".join(
            f"- {d.get('label','object')}: {d.get('position','?')}, {d.get('distance',0):.1f}m away"
            for d in relevant
        )
        prompt_text = (
            f"You are speaking to a blind person. Goal: {navigation_context}\n"
            f"Scene:\n{scene_text}\n\n"
            "Reply with one short verbal command. Max 15 words."
        )
        try:
            response = self.client.models.generate_content(
                model=self.model_name, contents=prompt_text
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
