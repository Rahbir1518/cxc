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
import asyncio
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


def _make_json_serializable(obj):
    """Convert numpy/scalar types to native Python for JSON."""
    if hasattr(obj, "item"):
        return obj.item()
    if isinstance(obj, (list, tuple)):
        return [_make_json_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _make_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (np.floating, np.integer)):
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    return obj


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
        annotated = detector.draw_detections(frame, detections)
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
    
    # Draw boxes
    annotated = detector.draw_detections(frame, detections)
    _, buffer = cv2.imencode('.jpg', annotated)
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    
    # Classify detections for response (ensure JSON-serializable, e.g. no numpy float32)
    classified = classifier.classify_all(detection_dicts)
    objects_serializable = _make_json_serializable(classified)
    
    return JSONResponse({
        "objects": objects_serializable,
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
    
    Client sends: base64-encoded JPEG frames
    Server sends: JSON with detections + annotated frame base64
    
    Performance optimizations:
    - Frame dropping: only processes the latest frame, discards stale queued frames
    - Tiered processing: depth/annotations run at lower frequency than detection
    - Response caching: instruction text cached when detections are stable
    """
    await manager.connect(websocket)
    
    # ── Tunable skip intervals ──
    DEPTH_EVERY_N       = 10   # Depth estimation every Nth processed frame
    ANNOTATE_EVERY_N    = 3    # Draw bounding-box image every Nth frame
    INSTRUCTION_EVERY_N = 8    # Regenerate instruction text every Nth frame
    DEPTH_MAX_AGE_S     = 4.0  # Force depth refresh if older than this (seconds)
    
    # ── Per-connection caches ──
    frame_count         = 0
    cached_depth_map    = None
    cached_frame_b64    = None   # Last annotated frame as base64
    cached_instruction  = ""     # Last navigation instruction
    cached_classified   = []     # Last classified objects list
    cached_label_set    = set()  # Labels from last instruction gen (change detection)
    last_depth_time     = 0.0    # Timestamp of last depth calculation
    
    try:
        while True:
            # ── 1. FRAME DROPPING: drain queue, keep only latest ──
            data = await websocket.receive_text()
            
            # Non-blocking drain: if more frames queued, skip to newest
            dropped = 0
            while True:
                try:
                    newer = await asyncio.wait_for(
                        websocket.receive_text(), timeout=0.001
                    )
                    data = newer
                    dropped += 1
                except asyncio.TimeoutError:
                    break
            
            # ── 2. Decode frame ──
            try:
                image_bytes = base64.b64decode(data)
                nparr = np.frombuffer(image_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                await websocket.send_json({"error": f"Invalid frame: {e}"})
                continue
            
            if frame is None:
                await websocket.send_json({"error": "Could not decode frame"})
                continue
            
            frame_count += 1
            now = time.monotonic()
            
            # ── 3. TIER 0 — Detection (every frame, fast ~30-50ms) ──
            detections = detector.detect(frame) if detector else []
            detection_dicts = [det.to_dict() for det in detections]
            
            # ── 4. TIER 1 — Depth estimation (every Nth frame or stale) ──
            depth_stale = (now - last_depth_time) > DEPTH_MAX_AGE_S
            run_depth = (
                depth_estimator is not None
                and detections
                and (frame_count % DEPTH_EVERY_N == 0
                     or cached_depth_map is None
                     or depth_stale)
            )
            
            if run_depth:
                cached_depth_map, _ = depth_estimator.estimate(frame)
                last_depth_time = now
            
            # Apply cached depth distances (fast lookup, ~<1ms)
            if cached_depth_map is not None and detections:
                for det in detections:
                    det.distance = depth_estimator.get_distance_for_bbox(
                        cached_depth_map, det.bbox
                    )
                # Refresh dicts with distances
                detection_dicts = [det.to_dict() for det in detections]
            
            # ── 5. TIER 2 — Classification (cheap, every frame) ──
            classifier = get_classifier()
            classified = classifier.classify_all(detection_dicts)
            cached_classified = classified
            
            # ── 6. TIER 3 — Annotated frame (every Nth frame) ──
            if frame_count % ANNOTATE_EVERY_N == 0:
                if detections:
                    annotated = detector.draw_detections(frame, detections)
                else:
                    annotated = frame
                _, buffer = cv2.imencode(
                    '.jpg', annotated,
                    [cv2.IMWRITE_JPEG_QUALITY, 40]  # Lower quality = faster encode + smaller payload
                )
                cached_frame_b64 = base64.b64encode(buffer).decode('utf-8')
            
            # ── 7. TIER 4 — Navigation instruction (every Nth, or on label change) ──
            current_labels = frozenset(d.get("label", "") for d in classified)
            labels_changed = current_labels != cached_label_set
            
            if (frame_count % INSTRUCTION_EVERY_N == 0
                    or labels_changed
                    or not cached_instruction):
                cached_instruction = classifier.generate_navigation_instruction(
                    detection_dicts
                )
                cached_label_set = current_labels
            
            # ── 8. Build & send response ──
            response: dict = {
                "objects": _make_json_serializable(cached_classified),
                "instruction": cached_instruction,
            }
            # Only include the (large) frame payload when we have a fresh one
            if cached_frame_b64 and frame_count % ANNOTATE_EVERY_N == 0:
                response["frame_base64"] = cached_frame_b64
            
            await websocket.send_json(response)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


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
