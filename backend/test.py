from elevenlabs.client import ElevenLabs
client = ElevenLabs(api_key="17ad749bec0b3dc7b7f048be91d3e2c87cddee28ac347677eec8c7bd3b72899c")
print(client.voices.get_all())