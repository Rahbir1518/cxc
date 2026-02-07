import { NextRequest, NextResponse } from 'next/server';

/**
 * Speech Synthesis API - ElevenLabs Integration
 * 
 * Converts text to natural-sounding speech for navigation guidance.
 * Uses ElevenLabs' neural TTS for high-quality, calm voice output.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice presets optimized for navigation
const VOICES = {
  default: '21m00Tcm4TlvDq8ikWAM',  // Rachel - calm, clear
  male: 'pNInz6obpgDQGcFmaJgB',     // Adam - calm male
  friendly: 'EXAVITQu4vr4xnSDxMaL', // Bella - warm, friendly
} as const;

// Voice settings optimized for navigation guidance
const NAVIGATION_VOICE_SETTINGS = {
  stability: 0.75,
  similarity_boost: 0.8,
  style: 0.3,
  use_speaker_boost: true,
};

interface SynthesizeRequest {
  text: string;
  voice?: keyof typeof VOICES | string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  stream?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    const body: SynthesizeRequest = await request.json();
    const { text, voice = 'default', priority = 'normal', stream = false } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Limit text length for safety
    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text too long. Maximum 5000 characters.' },
        { status: 400 }
      );
    }

    // Resolve voice ID
    const voiceId = VOICES[voice as keyof typeof VOICES] || voice;
    
    // Use turbo model for faster response, especially for urgent messages
    const modelId = priority === 'urgent' || priority === 'high' 
      ? 'eleven_flash_v2_5'  // Fastest model
      : 'eleven_turbo_v2';   // Good balance of speed and quality

    const endpoint = stream 
      ? `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`
      : `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`;

    const response = await fetch(`${endpoint}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: NAVIGATION_VOICE_SETTINGS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return NextResponse.json(
        { 
          error: 'Text-to-speech failed', 
          status: response.status,
          details: errorText 
        },
        { status: response.status }
      );
    }

    // Return audio as binary response
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'X-Priority': priority,
      },
    });

  } catch (error) {
    console.error('Synthesis error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint for service status and voice options
export async function GET(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  // Check if we should fetch available voices
  const { searchParams } = new URL(request.url);
  const listVoices = searchParams.get('voices') === 'true';

  if (listVoices && apiKey) {
    try {
      const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          voices: data.voices.map((v: { voice_id: string; name: string; labels: Record<string, string> }) => ({
            id: v.voice_id,
            name: v.name,
            labels: v.labels,
          })),
        });
      }
    } catch (error) {
      console.error('Failed to fetch voices:', error);
    }
  }

  return NextResponse.json({
    service: 'speech-synthesis',
    status: apiKey ? 'active' : 'not-configured',
    provider: 'ElevenLabs',
    features: {
      streaming: true,
      voiceSelection: true,
      priorityLevels: ['low', 'normal', 'high', 'urgent'],
    },
    defaultVoices: Object.keys(VOICES),
    voiceSettings: NAVIGATION_VOICE_SETTINGS,
  });
}
