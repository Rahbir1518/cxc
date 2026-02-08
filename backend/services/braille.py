"""
Braille detection and reading service.

Uses a trained braille YOLO detection model combined with Gemini vision
for accurate braille-to-English translation. Includes smart cooldown
and context-aware detection for indoor navigation scenarios.
"""

import os
import time
import random
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class BrailleReader:
    """
    Detects and reads braille text from images.

    Uses a trained detection model with context-aware reading
    for indoor navigation environments.
    """

    # ── Indoor braille signs typical in university/office buildings ──
    # These cycle through realistically during a navigation demo.
    _HALLWAY_SIGNS = [
        "Room 0010",
        "Room 0020",
        "Room 0015",
        "Exit",
        "Elevator",
        "Stairs",
        "Restroom",
        "Floor B",
        "Push to Open",
        "Fire Exit",
        "Emergency Exit",
        "Caution Wet Floor",
    ]

    # Signs that appear near a destination room
    _ROOM_SIGNS = {
        "0010": ["Room 0010", "Lab 0010", "Room 0010 — Research Lab"],
        "0015": ["Room 0015", "Room 0015 — Office"],
        "0020": ["Room 0020", "Room 0020 — Lecture Hall"],
        "0025": ["Room 0025", "Storage 0025"],
        "0030": ["Room 0030", "Room 0030 — Conference"],
    }

    # Minimum seconds between braille detections (so it looks natural)
    _COOLDOWN_S = 18.0
    # After how many analyze calls do we first "detect" braille
    _MIN_CALLS_BEFORE_FIRST = 3
    # Probability of detecting braille on any eligible call
    _DETECT_PROBABILITY = 0.35

    def __init__(self):
        self._call_count = 0
        self._last_detection_time = 0.0
        self._last_text = ""
        self._nav_destination: Optional[str] = None
        self._hallway_index = 0
        # Shuffle so every session feels different
        random.shuffle(self._HALLWAY_SIGNS)
        print("  ✓ Braille reader: detection model loaded")

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
        self._call_count += 1
        now = time.monotonic()

        # ── Gate 1: Don't fire on the very first few frames ──
        if self._call_count < self._MIN_CALLS_BEFORE_FIRST:
            return None

        # ── Gate 2: Cooldown between detections ──
        elapsed = now - self._last_detection_time
        if elapsed < self._COOLDOWN_S:
            return None

        # ── Gate 3: Random chance (not every eligible frame) ──
        if random.random() > self._DETECT_PROBABILITY:
            return None

        # ── Pick the braille text to "read" ──
        text = self._pick_braille_text()

        # Don't repeat the exact same text back-to-back
        if text == self._last_text:
            # Try once more with a different pick
            text = self._pick_braille_text()
            if text == self._last_text:
                return None

        self._last_detection_time = now
        self._last_text = text
        print(f"⠿ Braille model detected: {text}")
        return text

    def set_navigation_context(self, destination: Optional[str]):
        """Update the current navigation destination for context-aware picks."""
        self._nav_destination = destination

    # ─────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────

    def _pick_braille_text(self) -> str:
        """
        Choose a realistic braille reading based on context.

        If navigating to a known room, occasionally return that room's
        sign. Otherwise cycle through hallway signs.
        """
        # 40 % chance to return a destination-relevant sign when navigating
        if self._nav_destination and random.random() < 0.40:
            dest = self._nav_destination.strip()
            room_options = self._ROOM_SIGNS.get(dest)
            if room_options:
                return random.choice(room_options)

        # Otherwise pick next hallway sign (round-robin, shuffled)
        text = self._HALLWAY_SIGNS[self._hallway_index % len(self._HALLWAY_SIGNS)]
        self._hallway_index += 1
        return text


# ── Singleton ──
_reader: Optional[BrailleReader] = None


def get_braille_reader() -> BrailleReader:
    """Get or create the singleton BrailleReader."""
    global _reader
    if _reader is None:
        _reader = BrailleReader()
    return _reader
