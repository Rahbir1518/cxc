"""
FastAPI server for indoor navigation CV services.
Provides endpoints for:
- Object detection with bounding boxes
- Depth estimation for distances
- WebSocket for real-time video streaming
- ElevenLabs TTS for voice announcements
"""

import os
import io
import time
import base64
from PIL import Image
from contextlib import asynccontextmanager
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Local imports
from services.detection import ObjectDetector, DetectedObject, get_detector
from services.depth import DepthEstimator, get_depth_estimator
from services.tts import generate_voice_and_track_cost
from services.reasoning import ObstacleClassifier, get_classifier
from services.pathfinding import get_pathfinder

load_dotenv()


# Pydantic models for API
class DetectionResponse(BaseModel):
    objects: List[dict]
    frame_base64: Optional[str] = None  # Annotated frame as base64
    

class AnnouncementRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None

class NavigateRequest(BaseModel):
    text: str  # User voice command text
    start_room: str = "0020"  # Default start


# Global model instances
detector: Optional[ObjectDetector] = None
depth_estimator: Optional[DepthEstimator] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models on startup."""
    global detector, depth_estimator
    
    print("="*50)
    print("🚀 Starting Indoor Navigation CV Service")
    print("="*50)
    
    print("\n📦 Loading object detection model (YOLOv8)...")
    detector = get_detector()
    
    print("\n📦 Loading depth estimation model (MiDaS)...")
    try:
        depth_estimator = get_depth_estimator()
    except Exception as e:
        print(f"⚠️  Depth model failed to load: {e}")
        print("   Distance estimation will be disabled.")
        depth_estimator = None
    
    print("\n✅ Server ready!")
    print("="*50)
    
    yield
    
    print("\n👋 Shutting down...")


app = FastAPI(
    title="Indoor Navigation CV Service",
    description="Real-time object detection and distance estimation for visually impaired navigation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow phone browser to access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for phone testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (camera test page)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "running",
        "service": "Indoor Navigation CV",
        "detector_loaded": detector is not None,
        "depth_loaded": depth_estimator is not None,
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "models": {
            "detector": "YOLOv8" if detector else "not loaded",
            "depth": "MiDaS" if depth_estimator else "not loaded",
        }
    }


@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(
    file: UploadFile = File(...),
    draw_boxes: bool = True,
    estimate_depth: bool = True,
):
    """
    Detect objects in an uploaded image.
    
    - **file**: Image file (JPEG, PNG)
    - **draw_boxes**: Whether to return annotated image
    - **estimate_depth**: Whether to calculate distances
    
    Returns detected objects with optional annotated frame.
    """
    if detector is None:
        raise HTTPException(status_code=503, detail="Detector not loaded")
    
    # Read image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    # Detect objects
    detections = detector.detect(frame)
    
    # Estimate depth/distance if available
    if estimate_depth and depth_estimator is not None:
        depth_map, _ = depth_estimator.estimate(frame)
        for det in detections:
            det.distance = depth_estimator.get_distance_for_bbox(depth_map, det.bbox)
    
    # Draw bounding boxes
    frame_base64 = None
    if draw_boxes:
        annotated = detector.draw_detections(frame, detections, copy=True)
        _, buffer = cv2.imencode('.jpg', annotated)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
    
    return DetectionResponse(
        objects=[det.to_dict() for det in detections],
        frame_base64=frame_base64,
    )


@app.post("/announce")
async def announce_surroundings(request: AnnouncementRequest):
    """
    Generate voice announcement using ElevenLabs.
    
    - **text**: Text to speak
    - **voice_id**: Optional ElevenLabs voice ID
    
    Returns audio as streaming response.
    """
    try:
        print(f"🔊 Announce request: '{request.text}'")
        audio_data = generate_voice_and_track_cost(
            text=request.text,
            voice_id=request.voice_id or "JBFqnCBsd6RMkjVDRZzb",  # Default: calm voice
        )
        
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=announcement.mp3"}
        )
    except Exception as e:
        print(f"✗ TTS Error: {type(e).__name__}: {e}")
        # Return error as JSON so client can fall back to browser TTS
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


@app.post("/navigate")
async def navigate(request: NavigateRequest):
    """
    Parse navigation intent and return path.
    """
    classifier = get_classifier()
    intent = await classifier.get_navigation_intent(request.text)
    
    destination = intent.get("destination")
    if not destination:
        return JSONResponse({
            "error": "Could not identify destination room.",
            "intent": intent
        }, status_code=400)
    
    pathfinder = get_pathfinder()
    path = pathfinder.find_path(request.start_room, destination)
    
    if not path:
        return JSONResponse({
            "error": f"Could not find a path to room {destination}.",
            "destination": destination
        }, status_code=404)
    
    return {
        "destination": destination,
        "path": path,
        "instruction": f"Heading to room {destination}. I will tell you when to turn and when to watch for obstacles. Start walking forward and tap Announce anytime to hear what is in front of you."
    }


@app.post("/analyze-and-announce")
async def analyze_and_announce(
    file: UploadFile = File(...),
    navigation_context: Optional[str] = ""
):
    """
    Detect objects, calculate distances, and generate voice announcement.
    
    Returns:
    - Detected objects with distances
    - Annotated frame
    - Voice announcement describing the scene
    """
    if detector is None:
        raise HTTPException(status_code=503, detail="Detector not loaded")
    
    # Read image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    # Detect objects
    detections = detector.detect(frame)
    
    # Estimate distances
    if depth_estimator is not None:
        depth_map, _ = depth_estimator.estimate(frame)
        for det in detections:
            det.distance = depth_estimator.get_distance_for_bbox(depth_map, det.bbox)
    
    # Generate announcement using Gemini reasoning
    classifier = get_classifier()
    detection_dicts = [det.to_dict() for det in detections]
    
    # Use async Gemini visual reasoning
    # Convert BGR frame to RGB PIL Image
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb_frame)
    
    announcement = await classifier.reason_with_gemini(
        detection_dicts, 
        image_data=pil_image,
        navigation_context=navigation_context
    )
    
    # Draw boxes (copy=True: we still need the original frame above for Gemini)
    annotated = detector.draw_detections(frame, detections, copy=True)
    _, buffer = cv2.imencode('.jpg', annotated)
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    
    # Classify detections for response (to_dict + classify_all produce JSON-safe dicts)
    classified = classifier.classify_all(detection_dicts)
    
    return JSONResponse({
        "objects": classified,
        "frame_base64": frame_base64,
        "announcement": announcement,
    })


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"📱 Client connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"📱 Client disconnected. Total: {len(self.active_connections)}")


manager = ConnectionManager()


@app.websocket("/ws/video")
async def websocket_video(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video processing.

    Algorithmic optimisations over naive implementation:
    ┌──────────────────────────┬──────────────────────────────────────────┐
    │ Technique                │ Complexity improvement                   │
    ├──────────────────────────┼──────────────────────────────────────────┤
    │ Binary WS frames         │ Removes base64 decode O(n) + 33% data  │
    │ estimate_fast()          │ Bilinear O(w·h·4) vs bicubic O(w·h·16) │
    │ get_distance_bbox_fast() │ O(1) 3×3 sample vs O(k log k) median   │
    │ draw in-place            │ Eliminates O(w·h·3) frame.copy()       │
    │ to_dict() pre-converts   │ Removes recursive _make_json walk      │
    │ classify once            │ 1× classify_all vs 2× in old code      │
    │ instruction(pre_class.)  │ Skips redundant classify_all call       │
    │ Background depth thread  │ Depth never blocks the frame loop       │
    └──────────────────────────┴──────────────────────────────────────────┘

    Client may send EITHER raw binary JPEG bytes OR base64-encoded text.
    Server always returns JSON with frame_base64 on every processed frame.
    """
    await manager.connect(websocket)

    # ── Tunables ──
    DEPTH_COOLDOWN_S    = 2.0   # min seconds between depth runs
    INSTRUCTION_EVERY_N = 10    # re-generate text every Nth frame

    # ── Per-connection state ──
    frame_count        = 0
    cached_depth_map   = None
    cached_instruction = ""
    cached_classified: list = []
    cached_label_set: frozenset = frozenset()
    last_depth_time    = 0.0
    depth_running      = False  # guard for background depth

    # Pre-fetch singletons once (avoid repeated global dict lookups)
    _detector   = detector
    _depth      = depth_estimator
    _classifier = get_classifier()

    # Thread pool for offloading MiDaS so it never blocks the frame loop
    from concurrent.futures import ThreadPoolExecutor
    _depth_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="depth")

    try:
        while True:
            # ── 1. Receive frame (binary or text) ────────────────────
            msg = await websocket.receive()

            if "bytes" in msg and msg["bytes"]:
                # Fast path: raw binary JPEG from modern clients
                raw_bytes = msg["bytes"]
            elif "text" in msg and msg["text"]:
                # Legacy path: base64-encoded text
                raw_bytes = base64.b64decode(msg["text"])
            else:
                continue

            # ── 2. Decode JPEG → numpy (O(w*h)) ─────────────────────
            nparr = np.frombuffer(raw_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_json({"error": "Could not decode frame"})
                continue

            frame_count += 1
            now = time.monotonic()

            # ── 3. YOLO detection — every frame (~30-50 ms) ─────────
            detections = _detector.detect(frame) if _detector else []

            # ── 4. Depth — background thread, time-gated ────────────
            #    Runs estimate_fast (bilinear, no normalization) in a
            #    thread so the main loop is never blocked by MiDaS.
            if (_depth is not None
                    and detections
                    and not depth_running
                    and (now - last_depth_time) >= DEPTH_COOLDOWN_S):
                depth_running = True
                _frame_for_depth = frame  # capture reference

                def _run_depth(f=_frame_for_depth):
                    return _depth.estimate_fast(f)

                depth_future = _depth_pool.submit(_run_depth)

                def _on_depth_done(fut, _now=now):
                    nonlocal cached_depth_map, last_depth_time, depth_running
                    try:
                        cached_depth_map = fut.result()
                        last_depth_time = _now
                    except Exception as exc:
                        print(f"⚠️ Depth error: {exc}")
                    depth_running = False

                depth_future.add_done_callback(_on_depth_done)

            # ── 5. Distance lookup — O(1) per detection ──────────────
            if cached_depth_map is not None and detections:
                for det in detections:
                    det.distance = _depth.get_distance_for_bbox_fast(
                        cached_depth_map, det.bbox
                    )

            # ── 6. Classify — single pass, O(n) n≤5 ─────────────────
            detection_dicts = [det.to_dict() for det in detections]
            classified = _classifier.classify_all(detection_dicts)
            cached_classified = classified   # already JSON-safe

            # ── 7. Annotate IN-PLACE + JPEG encode ───────────────────
            if detections:
                _detector.draw_detections(frame, detections)  # in-place, no copy
            _, buffer = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, 45]
            )
            frame_b64 = base64.b64encode(buffer).decode('utf-8')

            # ── 8. Instruction — cache until labels change ───────────
            current_labels = frozenset(d["label"] for d in classified)
            if (current_labels != cached_label_set
                    or frame_count % INSTRUCTION_EVERY_N == 0
                    or not cached_instruction):
                cached_instruction = _classifier.generate_navigation_instruction(
                    detection_dicts, pre_classified=classified
                )
                cached_label_set = current_labels

            # ── 9. Send — no recursive serialisation needed ──────────
            await websocket.send_json({
                "objects":      cached_classified,
                "frame_base64": frame_b64,
                "instruction":  cached_instruction,
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)
    finally:
        _depth_pool.shutdown(wait=False)


if __name__ == "__main__":
    import uvicorn
    
    # Get port from env or default to 8000
    port = int(os.getenv("PORT", 8000))
    
    print(f"\n🌐 Starting server on http://0.0.0.0:{port}")
    print(f"📱 For phone access, use your computer's local IP address")
    print(f"   Example: http://192.168.x.x:{port}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",  # Allow external connections
        port=port,
        reload=False,  # Disable reload for production
    )
