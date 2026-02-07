import { NextRequest, NextResponse } from 'next/server';

/**
 * Speech Transcription API
 * 
 * This endpoint provides server-side speech-to-text as a fallback.
 * Primary transcription happens client-side via Web Speech API for lower latency.
 * 
 * For production, integrate with:
 * - ElevenLabs STT (coming soon)
 * - Whisper API (OpenAI)
 * - Google Speech-to-Text
 * - Azure Speech Services
 */

// For now, we'll use the browser's Web Speech API on the client side
// This endpoint serves as a fallback for audio file uploads

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // Handle audio blob uploads for server-side transcription
    if (contentType.includes('multipart/form-data') || contentType.includes('audio/')) {
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File | null;
      
      if (!audioFile) {
        return NextResponse.json(
          { error: 'No audio file provided' },
          { status: 400 }
        );
      }

      // In production, send to transcription service
      // For now, return a message to use client-side transcription
      return NextResponse.json({
        success: true,
        message: 'Server-side transcription not yet configured. Use client-side Web Speech API.',
        transcript: null,
        useClientSide: true,
      });
    }

    // Handle JSON requests (for config/testing)
    const body = await request.json();
    
    if (body.action === 'check_availability') {
      return NextResponse.json({
        available: false,
        message: 'Server-side transcription uses client Web Speech API',
        clientSideSupported: true,
        supportedLanguages: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE'],
      });
    }

    return NextResponse.json({ 
      error: 'Invalid request',
      hint: 'Send audio file or use action: check_availability'
    }, { status: 400 });

  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint for checking service status
export async function GET() {
  return NextResponse.json({
    service: 'speech-transcription',
    status: 'active',
    method: 'client-side',
    description: 'Speech recognition via browser Web Speech API',
    features: {
      realtime: true,
      languages: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE'],
      continuous: true,
      interimResults: true,
    },
    fallback: {
      available: false,
      reason: 'Configure OPENAI_API_KEY for Whisper fallback',
    },
  });
}
