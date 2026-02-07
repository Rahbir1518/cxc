"""
TTS service using ElevenLabs for voice announcements.
Provides clear, natural guidance for visually impaired users.
"""

import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


def get_elevenlabs_client():
    """Get ElevenLabs client instance."""
    try:
        from elevenlabs.client import ElevenLabs
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            raise ValueError("ELEVENLABS_API_KEY not set in environment")
        return ElevenLabs(api_key=api_key)
    except ImportError:
        raise ImportError("elevenlabs package not installed. Run: pip install elevenlabs")


def generate_voice_and_track_cost(
    text: str,
    voice_id: str = "JBFqnCBsd6RMkjVDRZzb",  # Default: calm, clear voice
    model_id: str = "eleven_flash_v2_5",  # Use Flash v2.5 for low latency
) -> bytes:
    """
    Generate speech from text and track character costs.
    
    Args:
        text: Text to convert to speech
        voice_id: ElevenLabs voice ID
        model_id: ElevenLabs model to use
        
    Returns:
        Audio data as bytes (MP3 format)
    """
    client = get_elevenlabs_client()
    try:
        # ElevenLabs SDK v2 uses text_to_speech.convert() instead of generate()
        response = client.text_to_speech.convert(
            text=text,
            voice_id=voice_id,
            model_id=model_id,
            output_format="mp3_44100_128",
        )
        # Response is a generator of bytes chunks
        return b"".join(response)
    except Exception as e:
        print(f"✗ TTS Generation Error: {e}")
        raise e


def generate_obstacle_announcement(
    objects: list,
    max_objects: int = 3,
) -> str:
    """
    Generate natural language announcement for detected obstacles.
    
    Args:
        objects: List of detected objects with distances
        max_objects: Maximum number of objects to announce
        
    Returns:
        Human-friendly announcement text
    """
    if not objects:
        return "The path ahead appears clear."
    
    # Filter objects with valid distances
    nearby = [o for o in objects if o.get("distance") and o["distance"] < 5.0]
    
    if not nearby:
        return "I see some objects, but they appear to be far away."
    
    # Sort by distance
    nearby.sort(key=lambda x: x["distance"])
    
    # Take closest N objects
    closest = nearby[:max_objects]
    
    # Build announcement
    parts = []
    for obj in closest:
        label = obj["label"]
        distance = obj["distance"]
        
        # Convert to natural language
        if distance < 0.5:
            dist_phrase = "very close, less than half a meter"
        elif distance < 1.0:
            dist_phrase = "about a meter away"
        elif distance < 2.0:
            dist_phrase = f"about {distance:.0f} meters ahead"
        else:
            dist_phrase = f"roughly {distance:.0f} meters away"
        
        parts.append(f"{label} {dist_phrase}")
    
    if len(parts) == 1:
        return f"Caution: {parts[0]}."
    else:
        return "Nearby: " + ", and ".join([", ".join(parts[:-1]), parts[-1]]) + "."


# Voice options for different announcement types
VOICE_PRESETS = {
    "calm": "JBFqnCBsd6RMkjVDRZzb",  # Calm, reassuring
    "alert": "pNInz6obpgDQGcFmaJgB",  # Slightly more urgent
    "friendly": "EXAVITQu4vr4xnSDxMaL",  # Warm and friendly
}


def get_voice_for_urgency(urgency: str = "normal") -> str:
    """Get appropriate voice ID based on urgency level."""
    if urgency == "high":
        return VOICE_PRESETS["alert"]
    elif urgency == "low":
        return VOICE_PRESETS["friendly"]
    return VOICE_PRESETS["calm"]
