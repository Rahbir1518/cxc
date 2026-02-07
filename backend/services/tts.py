import os
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv

load_dotenv()

# Initialize ElevenLabs client
client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

def generate_voice_and_track_cost(text: str, voice_id: str = "JBFqnCBv73JqnFnWJqrW"): # Default: Calm voice
    """
    Generate speech and print character costs.
    """
    # Get raw response with headers to track character cost
    response = client.text_to_speech.with_raw_response.convert(
        text=text,
        voice_id=voice_id,
        model_id="eleven_multilingual_v2",
    )
    
    # Access character cost from headers
    char_cost = response.headers.get("x-character-count")
    request_id = response.headers.get("request-id")
    
    print(f"ElevenLabs Generation Log:")
    print(f"  - Request ID: {request_id}")
    print(f"  - Character Cost: {char_cost}")
    
    return response.data
