"""
CXC Backend - FastAPI Server
Braille Detection + ElevenLabs TTS for visually impaired navigation
"""

import os
import io
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[*] CXC Backend starting up...")
    print("    Braille detection service: READY")
    print("    ElevenLabs TTS service: READY")
    yield
    print("[*] CXC Backend shutting down...")


# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CXC - Indoor Navigation Companion",
    description="Braille detection and voice guidance for visually impaired users",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow frontend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request/Response Models ─────────────────────────────────────────────────

class BrailleDetectRequest(BaseModel):
    image_base64: str
    method: str = "gemini"  # "gemini", "opencv", or "both"


class BrailleDetectResponse(BaseModel):
    text: str
    method: str
    confidence: str


class SpeakRequest(BaseModel):
    text: str
    voice_id: str = "JBFqnCBv73JqnFnWJqrW"  # Default: Calm voice


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "service": "CXC Backend", "features": ["braille", "tts"]}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ─── Braille Detection Endpoints ─────────────────────────────────────────────

@app.post("/braille/detect", response_model=BrailleDetectResponse)
async def braille_detect(request: BrailleDetectRequest):
    """
    Detect braille text from a base64-encoded image.
    
    Methods:
      - gemini: Uses Google Gemini Vision API (recommended for real-world images)
      - opencv: Uses OpenCV blob detection (works offline)
      - both: Tries both and returns the best result
    """
    from services.braille import detect_braille

    try:
        # Decode base64 image
        image_data = request.image_base64
        # Handle data URL format (data:image/...;base64,...)
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        
        image_bytes = base64.b64decode(image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")

    try:
        result = await detect_braille(image_bytes, method=request.method)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Braille detection failed: {str(e)}")

    if not result["text"]:
        return BrailleDetectResponse(
            text="",
            method=result["method"],
            confidence="none",
        )

    return BrailleDetectResponse(
        text=result["text"],
        method=result["method"],
        confidence=result["confidence"],
    )


@app.post("/braille/detect-upload")
async def braille_detect_upload(
    file: UploadFile = File(...),
    method: str = Form(default="gemini"),
):
    """
    Detect braille text from an uploaded image file.
    Alternative to base64 endpoint for direct file uploads.
    """
    from services.braille import detect_braille

    image_bytes = await file.read()
    
    try:
        result = await detect_braille(image_bytes, method=method)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Braille detection failed: {str(e)}")

    return result


# ─── Text-to-Speech Endpoint ─────────────────────────────────────────────────

@app.post("/braille/speak")
async def braille_speak(request: SpeakRequest):
    """
    Convert text to speech using ElevenLabs.
    Returns audio as a streaming MP3 response.
    """
    from services.tts import generate_voice_and_track_cost

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        audio_data = generate_voice_and_track_cost(
            text=request.text,
            voice_id=request.voice_id,
        )

        # Collect the audio bytes from the generator/iterator
        if hasattr(audio_data, '__iter__') and not isinstance(audio_data, bytes):
            audio_bytes = b"".join(chunk for chunk in audio_data)
        else:
            audio_bytes = audio_data

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=braille_speech.mp3",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


# ─── Combined: Detect + Speak ────────────────────────────────────────────────

@app.post("/braille/detect-and-speak")
async def braille_detect_and_speak(request: BrailleDetectRequest):
    """
    Full pipeline: Detect braille from image → Convert to speech.
    Returns JSON with text and base64-encoded audio.
    """
    from services.braille import detect_braille
    from services.tts import generate_voice_and_track_cost

    try:
        # Decode image
        image_data = request.image_base64
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        image_bytes = base64.b64decode(image_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")

    # Step 1: Detect braille
    try:
        result = await detect_braille(image_bytes, method=request.method)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Braille detection failed: {str(e)}")

    if not result["text"]:
        return JSONResponse(content={
            "text": "",
            "method": result["method"],
            "confidence": "none",
            "audio_base64": None,
            "message": "No braille detected in the image",
        })

    # Step 2: Generate speech
    try:
        audio_data = generate_voice_and_track_cost(text=result["text"])
        
        if hasattr(audio_data, '__iter__') and not isinstance(audio_data, bytes):
            audio_bytes = b"".join(chunk for chunk in audio_data)
        else:
            audio_bytes = audio_data

        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    except Exception as e:
        # Return text even if TTS fails
        return JSONResponse(content={
            "text": result["text"],
            "method": result["method"],
            "confidence": result["confidence"],
            "audio_base64": None,
            "message": f"Braille detected but TTS failed: {str(e)}",
        })

    return JSONResponse(content={
        "text": result["text"],
        "method": result["method"],
        "confidence": result["confidence"],
        "audio_base64": audio_b64,
        "message": f"Braille detected: '{result['text']}'",
    })


# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
