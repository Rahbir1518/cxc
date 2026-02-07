"""
Map Analyzer — uses Gemini Vision to study an SVG floor plan and
produce a navigation graph (rooms, doors, hallway waypoints, connections).

The analysis is expensive (one Gemini call), so results are cached to a
JSON file.  Subsequent server starts load the cache instantly.
"""

import os
import io
import json
import asyncio
from pathlib import Path
from typing import Dict, List, Any, Optional

from PIL import Image
from dotenv import load_dotenv

load_dotenv()

# ── Try imports (SVG renderers, in preference order) ──
import subprocess
import shutil

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


# ── Default cache location ──
_DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / "static" / "floor_plans"


class MapAnalyzer:
    """Analyse a floor-plan SVG with Gemini Vision and cache the result."""

    def __init__(self, cache_dir: Path = _DEFAULT_CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = None
        self.model_name = "gemini-2.0-flash"

        if GENAI_AVAILABLE:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    self.client = genai.Client(api_key=api_key)
                except Exception as e:
                    print(f"⚠️  Gemini client init failed: {e}")

    # ──────────────────── public API ────────────────────

    async def get_or_create_analysis(
        self, svg_path: str, *, force: bool = False
    ) -> Dict[str, Any]:
        """
        Return cached analysis JSON, or run Gemini Vision analysis and
        cache it.  Set *force=True* to re-analyse even if a cache exists.
        """
        cache_file = self._cache_path(svg_path)

        if not force and cache_file.exists():
            print(f"📂 Loading cached map analysis from {cache_file.name}")
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)

        print("🗺️  Analysing floor plan with Gemini Vision …")
        image = self._svg_to_image(svg_path)
        analysis = await self._analyse_with_gemini(image)

        # Persist
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(analysis, f, indent=2)
        print(f"✅ Map analysis cached → {cache_file.name}")

        return analysis

    # ──────────────────── SVG → Image ───────────────────

    def _svg_to_image(self, svg_path: str) -> Image.Image:
        """Convert an SVG file to a PIL Image.

        Strategy:
          1. Check for a pre-rendered PNG alongside the SVG
          2. Use Edge/Chrome headless to render (works on Windows)
          3. Raise if nothing works
        """
        resolved = Path(svg_path).resolve()

        # 1. Check for pre-rendered PNG
        pre_rendered = resolved.with_suffix(".png")
        if pre_rendered.exists() and pre_rendered.stat().st_size > 1000:
            print(f"   Using pre-rendered {pre_rendered.name}")
            return Image.open(str(pre_rendered)).convert("RGB")

        # 2. Headless browser rendering (Edge or Chrome)
        browser = self._find_browser()
        if browser:
            png_path = str(resolved.with_name(resolved.stem + "_render.png"))
            file_url = "file:///" + str(resolved).replace("\\", "/")
            try:
                proc = subprocess.Popen(
                    [
                        browser,
                        "--headless",
                        "--disable-gpu",
                        "--no-sandbox",
                        f"--screenshot={png_path}",
                        "--window-size=1224,792",
                        file_url,
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                # Edge/Chrome renders quickly but the process may linger
                try:
                    proc.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    proc.kill()

                if Path(png_path).exists() and Path(png_path).stat().st_size > 1000:
                    img = Image.open(png_path).convert("RGB")
                    # Save as pre-rendered for next time
                    img.save(str(pre_rendered), "PNG")
                    Path(png_path).unlink(missing_ok=True)
                    print(f"   Rendered SVG → {pre_rendered.name}")
                    return img
            except Exception as e:
                print(f"   Browser render failed: {e}")

        raise RuntimeError(
            "Could not convert SVG to image. "
            "Place a PNG with the same name next to the SVG, "
            "or install Microsoft Edge / Google Chrome."
        )

    @staticmethod
    def _find_browser() -> Optional[str]:
        """Find Edge or Chrome on the system."""
        candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        for path in candidates:
            if Path(path).exists():
                return path
        # Try PATH
        for name in ("msedge", "google-chrome", "chromium"):
            found = shutil.which(name)
            if found:
                return found
        return None

    # ──────────────── Gemini Vision call ────────────────

    async def _analyse_with_gemini(self, image: Image.Image) -> Dict[str, Any]:
        if not self.client:
            raise RuntimeError("Gemini client not initialised")

        # Prepare the image
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        img_bytes = buf.getvalue()
        image_part = types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")

        prompt = self._build_analysis_prompt()

        # Call Gemini (run in thread to avoid blocking)
        response = await asyncio.wait_for(
            asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=[prompt, image_part],
            ),
            timeout=60,
        )

        raw = response.text.strip()
        return self._parse_response(raw)

    # ──────────────────── Prompt ────────────────────────

    @staticmethod
    def _build_analysis_prompt() -> str:
        return """You are an expert architectural floor plan analyst. Study this building floor plan image very carefully.

The image uses an SVG coordinate system with viewBox "0 0 1224 792" (origin top-left, x goes right, y goes down).

Your task: identify every room, every door/opening, the hallway corridors, and how they connect.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "rooms": [
    {
      "id": "room_XXXX",
      "label": "XXXX",
      "center_x": <number in 0-1224>,
      "center_y": <number in 0-792>,
      "door_x": <x coordinate of the door/entrance to this room>,
      "door_y": <y coordinate of the door/entrance to this room>
    }
  ],
  "hallway_nodes": [
    {
      "id": "hall_N",
      "x": <number>,
      "y": <number>,
      "description": "brief description like 'hallway junction near room 0020'"
    }
  ],
  "connections": [
    { "from": "room_XXXX", "to": "hall_N" },
    { "from": "hall_N", "to": "hall_M" }
  ]
}

CRITICAL RULES:
1. Room IDs must be "room_" followed by the room number you can read on the plan (e.g. "room_0020", "room_0010").
2. Every room connects to the nearest hallway node through its door. The path room→hallway MUST go through the door coordinates (door_x, door_y).
3. Hallway nodes should be placed AT ACTUAL HALLWAY INTERSECTIONS and ALONG hallway corridors — these are the waypoints the path will follow. Place them every ~80-120px along hallways and at every turn/junction.
4. ALL coordinates must be INSIDE the building walls. Never place a node outside the building boundary.
5. Connections represent walkable paths. Two nodes are connected only if you can walk between them without going through a wall.
6. Include ALL rooms you can identify, even small ones (closets, bathrooms, utility rooms).
7. Hallway nodes MUST follow the actual corridor center-line. Place enough nodes so that a path following them stays inside the hallways.
8. Look very carefully at the room numbers printed on the floor plan. They are usually 4-digit numbers.

Return ONLY the JSON object. No other text."""

    # ──────────────────── Parse ─────────────────────────

    @staticmethod
    def _parse_response(raw: str) -> Dict[str, Any]:
        """Extract JSON from Gemini response (handles markdown fences)."""
        text = raw.strip()
        if text.startswith("```"):
            # Remove markdown code fence
            lines = text.split("\n")
            # Find opening and closing ```
            start = 1 if lines[0].startswith("```") else 0
            end = len(lines)
            for i in range(len(lines) - 1, 0, -1):
                if lines[i].strip() == "```":
                    end = i
                    break
            text = "\n".join(lines[start:end])

        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            print(f"⚠️  Failed to parse Gemini response as JSON: {e}")
            print(f"    Raw (first 500 chars): {text[:500]}")
            # Return minimal fallback
            data = {"rooms": [], "hallway_nodes": [], "connections": []}

        # Validate structure
        for key in ("rooms", "hallway_nodes", "connections"):
            if key not in data:
                data[key] = []

        return data

    # ──────────────────── Helpers ───────────────────────

    def _cache_path(self, svg_path: str) -> Path:
        stem = Path(svg_path).stem  # e.g. "basement"
        return self.cache_dir / f"{stem}_analysis.json"


# ── Singleton ──
_analyzer: Optional[MapAnalyzer] = None


def get_map_analyzer() -> MapAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = MapAnalyzer()
    return _analyzer
