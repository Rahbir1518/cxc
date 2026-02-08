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
from services.map_analyzer import get_map_analyzer

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
    text: str  # User voice command text  (e.g. "I'm in room 0020, take me to room 0010")
    start_room: Optional[str] = None  # Optional explicit start room


# Global model instances
detector: Optional[ObjectDetector] = None
depth_estimator: Optional[DepthEstimator] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models and analyse floor plan on startup."""
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
    
    # ── Analyse floor plan and build navigation graph ──
    svg_path = os.path.join("static", "floor_plans", "basement.svg")
    if os.path.exists(svg_path):
        try:
            analyzer = get_map_analyzer()
            analysis = await analyzer.get_or_create_analysis(svg_path)
            pathfinder = get_pathfinder()
            pathfinder.load_from_analysis(analysis)
            rooms = pathfinder.get_available_rooms()
            print(f"🗺️  Known rooms: {', '.join(rooms)}")
        except Exception as e:
            print(f"⚠️  Map analysis failed: {e}")
            print("   Navigation will be limited.")
    else:
        print(f"⚠️  Floor plan not found at {svg_path}")
    
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
    
    # Detect objects (offload to thread pool to avoid blocking event loop)
    detections = await asyncio.to_thread(detector.detect, frame)
    
    # Estimate depth/distance if available
    if estimate_depth and depth_estimator is not None:
        depth_map, _ = await asyncio.to_thread(depth_estimator.estimate, frame)
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
        audio_data = await generate_voice_and_track_cost(
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
    Parse navigation intent (start + destination) and return path.
    User can say: 'I am in room 0020, take me to room 0010'
    """
    classifier = get_classifier()
    intent = await classifier.get_navigation_intent(request.text)

    destination = intent.get("destination")
    start_room = request.start_room or intent.get("start_room")

    if not destination:
        return JSONResponse({
            "error": "Could not identify destination room.",
            "intent": intent
        }, status_code=400)

    if not start_room:
        return JSONResponse({
            "error": "Please tell me which room you are currently in.",
            "intent": intent
        }, status_code=400)

    pathfinder = get_pathfinder()

    # Check rooms are known
    available = pathfinder.get_available_rooms()
    if not available:
        # No rooms loaded at all — map analysis may have failed
        return JSONResponse({
            "error": "No rooms have been loaded. The floor plan may not have been analysed yet. Try the /reanalyze-map endpoint.",
        }, status_code=503)

    resolved_start = pathfinder._resolve(start_room)
    if resolved_start is None:
        return JSONResponse({
            "error": f"Unknown start room '{start_room}'. Available: {', '.join(available)}",
            "available_rooms": available,
        }, status_code=404)

    resolved_dest = pathfinder._resolve(destination)
    if resolved_dest is None:
        return JSONResponse({
            "error": f"Unknown destination room '{destination}'. Available: {', '.join(available)}",
            "available_rooms": available,
        }, status_code=404)

    path = pathfinder.find_path(start_room, destination)

    if not path:
        return JSONResponse({
            "error": f"Could not find a path from room {start_room} to room {destination}. The rooms exist but are not connected in the navigation graph.",
            "destination": destination,
            "start_room": start_room,
        }, status_code=404)

    return {
        "start_room": start_room,
        "destination": destination,
        "path": path,
        "instruction": (
            f"Heading from room {start_room} to room {destination}. "
            f"I will tell you when to turn and when to watch for obstacles. "
            f"Start walking forward and tap Announce anytime to hear what is in front of you."
        ),
    }


@app.get("/rooms")
async def list_rooms():
    """Return all known rooms from the map analysis."""
    pathfinder = get_pathfinder()
    rooms = pathfinder.get_available_rooms()
    return {"rooms": rooms}


@app.post("/reanalyze-map")
async def reanalyze_map():
    """Force re-analysis of the floor plan (admin/debug endpoint)."""
    svg_path = os.path.join("static", "floor_plans", "basement.svg")
    if not os.path.exists(svg_path):
        raise HTTPException(status_code=404, detail="Floor plan SVG not found")
    try:
        analyzer = get_map_analyzer()
        analysis = await analyzer.get_or_create_analysis(svg_path, force=True)
        pathfinder = get_pathfinder()
        pathfinder.load_from_analysis(analysis)
        return {
            "status": "ok",
            "rooms": pathfinder.get_available_rooms(),
            "hallway_nodes": len(analysis.get("hallway_nodes", [])),
            "connections": len(analysis.get("connections", [])),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    
    # Detect objects (offload to thread pool)
    detections = await asyncio.to_thread(detector.detect, frame)
    
    # Estimate distances (offload to thread pool)
    if depth_estimator is not None:
        depth_map, _ = await asyncio.to_thread(depth_estimator.estimate, frame)
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
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"📱 Client disconnected. Total: {len(self.active_connections)}")


# Viewer connection manager (for dashboard viewers)
class ViewerManager:
    def __init__(self):
        self.viewers: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.viewers.append(websocket)
        print(f"👁️  Viewer connected. Total: {len(self.viewers)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.viewers:
            self.viewers.remove(websocket)
        print(f"👁️  Viewer disconnected. Total: {len(self.viewers)}")
    
    async def broadcast(self, data: dict):
        """Send data to all connected viewers."""
        if not self.viewers:
            return
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json(data)
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            self.disconnect(v)


manager = ConnectionManager()
viewer_manager = ViewerManager()


# ── Meta Glasses connection managers ──
class GlassesConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"🕶️  Glasses client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"🕶️  Glasses client disconnected. Total: {len(self.active_connections)}")


class GlassesViewerManager:
    def __init__(self):
        self.viewers: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.viewers.append(websocket)
        print(f"👁️  Glasses viewer connected. Total: {len(self.viewers)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.viewers:
            self.viewers.remove(websocket)
        print(f"👁️  Glasses viewer disconnected. Total: {len(self.viewers)}")

    async def broadcast(self, data: dict):
        if not self.viewers:
            return
        disconnected = []
        for viewer in self.viewers:
            try:
                await viewer.send_json(data)
            except Exception:
                disconnected.append(viewer)
        for v in disconnected:
            self.disconnect(v)


glasses_manager = GlassesConnectionManager()
glasses_viewer_manager = GlassesViewerManager()


@app.post("/read-text")
async def read_text(
    file: UploadFile = File(...),
):
    """
    OCR + Text Reading endpoint for visually impaired users.
    Uses Gemini Vision to read all visible text in the image,
    then returns the text and optionally generates TTS audio.

    - **file**: Image file (JPEG, PNG) — typically a frame from Meta Glasses
    Returns: { text_found, announcement }
    """
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Use Gemini Vision to read text
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb_frame)

    classifier = get_classifier()
    try:
        text_result = await classifier.read_text_in_image(pil_image)
    except AttributeError:
        # Fallback: use generic Gemini reasoning with a text-reading prompt
        text_result = await classifier.reason_with_gemini(
            [],
            image_data=pil_image,
            navigation_context=(
                "IMPORTANT: You are helping a visually impaired person READ TEXT. "
                "Carefully read ALL visible text in this image — signs, labels, documents, "
                "screens, books, menus, nameplates, room numbers, etc. "
                "Read the text out loud exactly as written, then briefly describe where "
                "each piece of text is located. If no text is visible, say so clearly."
            ),
        )

    return JSONResponse({
        "text_found": text_result,
        "announcement": text_result,
    })


@app.websocket("/ws/video")
async def websocket_video(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video processing.
    
    Client sends: base64-encoded JPEG frames
    Server sends: JSON with detections + annotated frame base64
    
    Performance strategy — smooth video, throttled depth:
    - Every frame: YOLO detection + draw annotations + encode → always send frame_base64
    - Depth (MiDaS): runs on a *time-based* cooldown so it never blocks consecutive
      frames.  Between depth runs the cached depth map is re-used for distance lookups.
    - Instruction text: cached and only regenerated when detected labels change.
    - Frame dropping: stale queued frames are drained so only the latest is processed.
    """
    await manager.connect(websocket)
    
    # ── Depth throttle (time-based, not frame-count) ──
    DEPTH_COOLDOWN_S    = 1.5  # Minimum seconds between depth runs
    INSTRUCTION_EVERY_N = 8    # Regenerate instruction text every Nth frame
    
    # ── Per-connection state ──
    frame_count         = 0
    cached_depth_map    = None
    cached_instruction  = ""
    cached_classified   = []
    cached_label_set    = set()
    last_depth_time     = 0.0   # monotonic timestamp of last depth calc
    
    try:
        while True:
            # ── 1. Drain queue — keep only the freshest frame ──
            data = await websocket.receive_text()
            while True:
                try:
                    newer = await asyncio.wait_for(
                        websocket.receive_text(), timeout=0.001
                    )
                    data = newer          # drop the older frame
                except asyncio.TimeoutError:
                    break
            
            # ── 2. Decode ──
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
            
            # ── 3. Detection — every frame (YOLOv8n, ~30-50 ms, offloaded) ──
            detections = (
                await asyncio.to_thread(detector.detect, frame)
                if detector else []
            )
            
            # ── 4. Depth — only when cooldown has elapsed (offloaded) ──
            if (depth_estimator is not None
                    and detections
                    and (now - last_depth_time) >= DEPTH_COOLDOWN_S):
                cached_depth_map, _ = await asyncio.to_thread(
                    depth_estimator.estimate, frame
                )
                last_depth_time = now
            
            # Re-use cached depth map for fast per-bbox distance lookup (~<1 ms)
            if cached_depth_map is not None and detections:
                for det in detections:
                    det.distance = depth_estimator.get_distance_for_bbox(
                        cached_depth_map, det.bbox
                    )
            
            # ── 5. Classify (cheap) ──
            detection_dicts = [det.to_dict() for det in detections]
            classifier = get_classifier()
            classified = classifier.classify_all(detection_dicts)
            cached_classified = classified
            
            # ── 6. Annotate + encode — every frame for smooth video ──
            annotated = (
                detector.draw_detections(frame, detections)
                if detections else frame
            )
            _, buffer = cv2.imencode(
                '.jpg', annotated,
                [cv2.IMWRITE_JPEG_QUALITY, 45]
            )
            frame_b64 = base64.b64encode(buffer).decode('utf-8')
            
            # ── 7. Instruction — cache until labels change ──
            current_labels = frozenset(d.get("label", "") for d in classified)
            if (current_labels != cached_label_set
                    or frame_count % INSTRUCTION_EVERY_N == 0
                    or not cached_instruction):
                cached_instruction = classifier.generate_navigation_instruction(
                    detection_dicts
                )
                cached_label_set = current_labels
            
            # ── 8. Send — always includes frame_base64 for smooth playback ──
            response_data = {
                "objects": _make_json_serializable(cached_classified),
                "frame_base64": frame_b64,
                "instruction": cached_instruction,
            }
            await websocket.send_json(response_data)
            
            # ── 9. Broadcast to dashboard viewers ──
            await viewer_manager.broadcast(response_data)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@app.websocket("/ws/viewer")
async def websocket_viewer(websocket: WebSocket):
    """
    WebSocket endpoint for dashboard viewers.
    
    Viewers receive the same processed frames and detections as the camera
    client, broadcast in real-time from /ws/video. This allows the dashboard
    to display the phone's camera feed without opening a local webcam.
    
    The viewer does NOT send frames — it only receives.
    """
    await viewer_manager.connect(websocket)
    try:
        # Keep connection alive — wait for client disconnect
        while True:
            # Accept pings / text (heartbeat) from dashboard
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send a keepalive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        viewer_manager.disconnect(websocket)
    except Exception as e:
        print(f"Viewer WebSocket error: {e}")
        viewer_manager.disconnect(websocket)


@app.websocket("/ws/glasses")
async def websocket_glasses(websocket: WebSocket):
    """
    WebSocket endpoint for Meta Glasses real-time video processing.

    Identical pipeline to /ws/video but:
    - Uses higher resolution frames (glasses → phone relay → server)
    - Includes OCR / text-reading capability on every Nth frame
    - Broadcasts to /ws/glasses-viewer (separate from phone viewers)

    Client sends: base64-encoded JPEG frames
    Server sends: JSON with detections + annotated frame + instruction + text_found
    """
    await glasses_manager.connect(websocket)

    DEPTH_COOLDOWN_S = 1.5
    INSTRUCTION_EVERY_N = 8
    TEXT_READ_EVERY_N = 30  # OCR every ~30 frames (roughly every 3-5 seconds)

    frame_count = 0
    cached_depth_map = None
    cached_instruction = ""
    cached_classified = []
    cached_label_set: set = set()
    cached_text = ""
    last_depth_time = 0.0

    try:
        while True:
            # 1. Drain queue — keep only the freshest frame
            data = await websocket.receive_text()
            while True:
                try:
                    newer = await asyncio.wait_for(
                        websocket.receive_text(), timeout=0.001
                    )
                    data = newer
                except asyncio.TimeoutError:
                    break

            # 2. Decode
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

            # 3. Detection — every frame
            detections = (
                await asyncio.to_thread(detector.detect, frame)
                if detector
                else []
            )

            # 4. Depth — time-throttled
            if (
                depth_estimator is not None
                and detections
                and (now - last_depth_time) >= DEPTH_COOLDOWN_S
            ):
                cached_depth_map, _ = await asyncio.to_thread(
                    depth_estimator.estimate, frame
                )
                last_depth_time = now

            if cached_depth_map is not None and detections:
                for det in detections:
                    det.distance = depth_estimator.get_distance_for_bbox(
                        cached_depth_map, det.bbox
                    )

            # 5. Classify
            detection_dicts = [det.to_dict() for det in detections]
            classifier = get_classifier()
            classified = classifier.classify_all(detection_dicts)
            cached_classified = classified

            # 6. Encode raw frame (no bounding boxes — reduces latency)
            _, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 50]
            )
            frame_b64 = base64.b64encode(buffer).decode("utf-8")

            # 7. Instruction — cache until labels change
            current_labels = frozenset(d.get("label", "") for d in classified)
            if (
                current_labels != cached_label_set
                or frame_count % INSTRUCTION_EVERY_N == 0
                or not cached_instruction
            ):
                cached_instruction = classifier.generate_navigation_instruction(
                    detection_dicts
                )
                cached_label_set = current_labels

            # 8. OCR / Text reading — periodic (non-blocking, best effort)
            if frame_count % TEXT_READ_EVERY_N == 0:
                try:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_image = Image.fromarray(rgb_frame)
                    try:
                        cached_text = await classifier.read_text_in_image(pil_image)
                    except AttributeError:
                        cached_text = await classifier.reason_with_gemini(
                            [],
                            image_data=pil_image,
                            navigation_context=(
                                "Read ALL visible text in this image briefly. "
                                "Signs, labels, room numbers, screens, etc. "
                                "If no text, reply 'No text visible'."
                            ),
                        )
                except Exception as e:
                    print(f"Glasses OCR error: {e}")

            # 9. Send response
            response_data = {
                "objects": _make_json_serializable(cached_classified),
                "frame_base64": frame_b64,
                "instruction": cached_instruction,
                "text_found": cached_text,
                "source": "glasses",
            }
            await websocket.send_json(response_data)

            # 10. Broadcast to glasses dashboard viewers
            await glasses_viewer_manager.broadcast(response_data)

    except WebSocketDisconnect:
        glasses_manager.disconnect(websocket)
    except Exception as e:
        print(f"Glasses WebSocket error: {e}")
        glasses_manager.disconnect(websocket)


@app.websocket("/ws/glasses-viewer")
async def websocket_glasses_viewer(websocket: WebSocket):
    """
    WebSocket endpoint for dashboard viewers of the Meta Glasses feed.
    Receives broadcast from /ws/glasses in real-time.
    """
    await glasses_viewer_manager.connect(websocket)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
    except WebSocketDisconnect:
        glasses_viewer_manager.disconnect(websocket)
    except Exception as e:
        print(f"Glasses viewer WebSocket error: {e}")
        glasses_viewer_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    # Get port from env or default to 8000
    port = int(os.getenv("PORT", 8000))

    print(f"\n🌐 Starting server on http://0.0.0.0:{port}")
    print(f"📱 For phone access, use your computer's local IP address")
    print(f"🕶️  For Meta Glasses, open /static/glasses_feed.html on your iPhone")
    print(f"   Example: http://192.168.x.x:{port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        reload=False,
        timeout_keep_alive=30,
    )
