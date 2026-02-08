"""
Braille detection and reading service.

Two-tier approach:
  1. Roboflow YOLO braille detection model (optional, for individual character detection)
  2. Gemini 2.0 Flash multimodal vision (reads full sentences from braille images)

The Gemini approach handles full sentences natively and requires no additional API keys
beyond the existing GOOGLE_GEMINI_API_KEY.

If ROBOFLOW_API_KEY is configured, the Roboflow model is used as a fast pre-filter
to confirm braille presence before the heavier Gemini reading pass.
"""

import os
import io
import asyncio
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# ── Gemini SDK ──
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# ── Roboflow SDK (optional — only loaded if API key is present) ──
ROBOFLOW_AVAILABLE = False
if os.getenv("ROBOFLOW_API_KEY"):
    try:
        from roboflow import Roboflow
        ROBOFLOW_AVAILABLE = True
    except ImportError:
        pass

# ── Constants ──
BRAILLE_TIMEOUT_S = 10.0
BRAILLE_MAX_RETRIES = 1
ROBOFLOW_CONFIDENCE = 30  # Minimum confidence for braille character detection

# ── Gemini prompt for braille reading ──
BRAILLE_READING_PROMPT = """Examine this image carefully for any braille text.

Braille is a tactile writing system using patterns of raised dots arranged in cells.
Each cell has up to 6 dots in a 3-row × 2-column grid. Braille appears on:
- Signs (room numbers, bathroom signs, elevator panels)
- Door plates and nameplates
- Books and documents
- Packaging and labels
- ATMs, vending machines, railings

TASK:
1. Determine if there is ANY braille visible in this image.
2. If braille IS present, read it and translate to English.

RESPONSE FORMAT:
- If braille is found, respond with ONLY the English translation. No explanations.
- If NO braille is visible, respond with exactly: NONE

Examples of valid responses:
  "Room 204"
  "Exit"
  "Push to open"
  "Floor 3"
  "NONE"
"""


class BrailleReader:
    """
    Detects and reads braille text from images.
    
    Uses Gemini 2.0 Flash multimodal for reading braille and translating
    to English text. Optionally uses a Roboflow YOLO model for fast
    braille presence detection.
    """

    def __init__(self):
        self.gemini_client = None
        self.model_name = "gemini-2.0-flash"
        self.roboflow_model = None

        # ── Initialize Gemini ──
        if GEMINI_AVAILABLE:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    self.gemini_client = genai.Client(api_key=api_key)
                    print("  ✓ Braille reader: Gemini vision enabled")
                except Exception as e:
                    print(f"  ⚠️ Braille reader: Gemini init failed: {e}")

        # ── Initialize Roboflow (optional fast detector) ──
        if ROBOFLOW_AVAILABLE:
            rf_key = os.getenv("ROBOFLOW_API_KEY")
            if rf_key:
                try:
                    rf = Roboflow(api_key=rf_key)
                    project = rf.workspace("braille-lq5eh").project("braille-detection")
                    self.roboflow_model = project.version(2).model
                    print("  ✓ Braille reader: Roboflow YOLO model loaded")
                except Exception as e:
                    print(f"  ⚠️ Braille reader: Roboflow init failed: {e}")

        if not self.gemini_client and not self.roboflow_model:
            print("  ⚠️ Braille reader: No backend available (need GOOGLE_GEMINI_API_KEY or ROBOFLOW_API_KEY)")

    # ─────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────

    async def detect_and_read(self, image_data) -> Optional[str]:
        """
        Detect braille in an image and read it.
        
        Args:
            image_data: PIL Image object
            
        Returns:
            The English text the braille says, or None if no braille found.
        """
        # Strategy 1: If Roboflow available, use it for fast pre-filter
        if self.roboflow_model:
            roboflow_text = await self._detect_with_roboflow(image_data)
            if roboflow_text:
                # Roboflow found braille characters — enhance with Gemini if available
                if self.gemini_client:
                    gemini_text = await self._read_with_gemini(image_data)
                    if gemini_text:
                        return gemini_text
                return roboflow_text
            # Roboflow found nothing — skip Gemini call (save API usage)
            return None

        # Strategy 2: Gemini-only (default, no extra API key needed)
        if self.gemini_client:
            return await self._read_with_gemini(image_data)

        return None

    # ─────────────────────────────────────────────────────────────
    # Roboflow character detection
    # ─────────────────────────────────────────────────────────────

    async def _detect_with_roboflow(self, image_data) -> Optional[str]:
        """
        Use Roboflow YOLO model to detect individual braille characters.
        Sort spatially to form text.
        """
        try:
            # Save PIL image to temp bytes for Roboflow
            img_buffer = io.BytesIO()
            image_data.save(img_buffer, format="JPEG")
            img_bytes = img_buffer.getvalue()

            # Run inference in thread pool (blocking SDK call)
            result = await asyncio.to_thread(
                self._roboflow_predict, img_bytes
            )

            if not result or not result.get("predictions"):
                return None

            predictions = result["predictions"]
            if len(predictions) < 2:
                # Need at least 2 characters to form meaningful text
                return None

            # Sort characters spatially: top-to-bottom, left-to-right
            text = self._assemble_braille_text(predictions)
            return text if text else None

        except Exception as e:
            print(f"⚠️ Roboflow braille detection error: {e}")
            return None

    def _roboflow_predict(self, img_bytes: bytes) -> dict:
        """Synchronous Roboflow prediction (runs in thread pool)."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(img_bytes)
            temp_path = f.name
        try:
            return self.roboflow_model.predict(
                temp_path, confidence=ROBOFLOW_CONFIDENCE
            ).json()
        finally:
            os.unlink(temp_path)

    def _assemble_braille_text(self, predictions: list) -> str:
        """
        Assemble individual braille character detections into readable text.
        
        Strategy:
        - Sort by Y coordinate (top to bottom) to identify lines
        - Within each line, sort by X coordinate (left to right)
        - Detect word boundaries by checking gaps between characters
        """
        if not predictions:
            return ""

        # Filter to letter/number classes only (A-Z, 0-9, t)
        valid_chars = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        chars = []
        for p in predictions:
            cls = str(p.get("class", ""))
            if cls in valid_chars or (len(cls) == 1 and cls.isalnum()):
                chars.append({
                    "char": cls.upper() if len(cls) == 1 else cls,
                    "x": p.get("x", 0),
                    "y": p.get("y", 0),
                    "width": p.get("width", 0),
                    "height": p.get("height", 0),
                    "confidence": p.get("confidence", 0),
                })

        if not chars:
            return ""

        # Sort by Y first (top to bottom)
        chars.sort(key=lambda c: c["y"])

        # Group into lines (characters within similar Y are same line)
        lines = []
        current_line = [chars[0]]
        avg_height = sum(c["height"] for c in chars) / len(chars)
        line_threshold = avg_height * 0.6  # Y difference threshold for same line

        for c in chars[1:]:
            if abs(c["y"] - current_line[-1]["y"]) < line_threshold:
                current_line.append(c)
            else:
                lines.append(current_line)
                current_line = [c]
        lines.append(current_line)

        # Sort each line left-to-right and detect word gaps
        result_lines = []
        for line in lines:
            line.sort(key=lambda c: c["x"])

            # Calculate average character spacing for word gap detection
            if len(line) > 1:
                spacings = [
                    line[i + 1]["x"] - line[i]["x"]
                    for i in range(len(line) - 1)
                ]
                avg_spacing = sum(spacings) / len(spacings)
                word_gap_threshold = avg_spacing * 1.8
            else:
                word_gap_threshold = float("inf")

            # Build text with spaces for word gaps
            text_parts = [line[0]["char"]]
            for i in range(1, len(line)):
                gap = line[i]["x"] - line[i - 1]["x"]
                if gap > word_gap_threshold:
                    text_parts.append(" ")
                text_parts.append(line[i]["char"])

            result_lines.append("".join(text_parts))

        return " ".join(result_lines).strip()

    # ─────────────────────────────────────────────────────────────
    # Gemini vision reading
    # ─────────────────────────────────────────────────────────────

    async def _read_with_gemini(self, image_data) -> Optional[str]:
        """
        Use Gemini 2.0 Flash multimodal to detect and read braille.
        Handles full sentences natively.
        """
        if not self.gemini_client:
            return None

        try:
            # Convert PIL Image to bytes
            img_buffer = io.BytesIO()
            image_data.save(img_buffer, format="JPEG")
            img_bytes = img_buffer.getvalue()

            image_part = types.Part.from_bytes(
                data=img_bytes,
                mime_type="image/jpeg",
            )

            last_err = None
            for attempt in range(BRAILLE_MAX_RETRIES + 1):
                try:
                    response = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.gemini_client.models.generate_content,
                            model=self.model_name,
                            contents=[BRAILLE_READING_PROMPT, image_part],
                        ),
                        timeout=BRAILLE_TIMEOUT_S,
                    )
                    result = response.text.strip()

                    # Check if braille was found
                    if result.upper() == "NONE" or not result:
                        return None

                    # Filter out explanatory text if model got chatty
                    # (should be just the translated text per our prompt)
                    if "no braille" in result.lower():
                        return None
                    if "i don't see" in result.lower():
                        return None
                    if "there is no" in result.lower():
                        return None

                    return result

                except (asyncio.TimeoutError, Exception) as e:
                    last_err = e
                    if attempt < BRAILLE_MAX_RETRIES:
                        await asyncio.sleep(0.5)

            print(f"⚠️ Braille Gemini reading failed: {last_err}")
            return None

        except Exception as e:
            print(f"⚠️ Braille detection error: {e}")
            return None


# ── Singleton ──
_reader: Optional[BrailleReader] = None


def get_braille_reader() -> BrailleReader:
    """Get or create the singleton BrailleReader."""
    global _reader
    if _reader is None:
        _reader = BrailleReader()
    return _reader
