import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/**
 * ElevenLabs client initialization.
 * Requires ELEVENLABS_API_KEY in .env.local
 */
export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export default elevenlabs;
