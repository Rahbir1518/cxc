import { NextRequest, NextResponse } from "next/server";
import { elevenlabs } from "@/lib/elevenlabs";

const BACKEND_URL = process.env.PYTHON_CV_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/braille
 * 
 * Accepts a base64 image, detects braille text, and returns
 * the detected text + audio speech from ElevenLabs.
 * 
 * Two modes:
 *   1. "backend" - Proxies to the Python FastAPI backend (OpenCV + Gemini)
 *   2. "gemini"  - Uses Gemini directly from Next.js (no Python backend needed)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_base64, method = "gemini", mode = "direct" } = body;

    if (!image_base64) {
      return NextResponse.json(
        { error: "image_base64 is required" },
        { status: 400 }
      );
    }

    let detectedText = "";
    let detectionMethod = "";

    if (mode === "backend") {
      // ─── Mode 1: Proxy to Python backend ─────────────────────
      try {
        const backendResponse = await fetch(`${BACKEND_URL}/braille/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64, method }),
        });

        if (!backendResponse.ok) {
          throw new Error(`Backend returned ${backendResponse.status}`);
        }

        const result = await backendResponse.json();
        detectedText = result.text || "";
        detectionMethod = result.method || "backend";
      } catch (e) {
        console.error("Backend braille detection failed, falling back to Gemini direct:", e);
        // Fall back to direct Gemini
        const geminiResult = await detectBrailleWithGemini(image_base64);
        detectedText = geminiResult;
        detectionMethod = "gemini-fallback";
      }
    } else {
      // ─── Mode 2: Direct Gemini Vision ────────────────────────
      detectedText = await detectBrailleWithGemini(image_base64);
      detectionMethod = "gemini-direct";
    }

    if (!detectedText) {
      return NextResponse.json({
        text: "",
        method: detectionMethod,
        audio_base64: null,
        message: "No braille detected in the image",
      });
    }

    // ─── Generate speech with ElevenLabs ─────────────────────
    let audioBase64: string | null = null;

    try {
      const audioResponse = await elevenlabs.textToSpeech.convert(
        "JBFqnCBv73JqnFnWJqrW", // Calm voice
        {
          text: `Braille detected: ${detectedText}`,
          model_id: "eleven_multilingual_v2",
        }
      );

      // Collect chunks from the readable stream
      const chunks: Buffer[] = [];
      for await (const chunk of audioResponse as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      audioBase64 = audioBuffer.toString("base64");
    } catch (ttsError) {
      console.error("ElevenLabs TTS failed:", ttsError);
    }

    return NextResponse.json({
      text: detectedText,
      method: detectionMethod,
      audio_base64: audioBase64,
      message: `Braille detected: "${detectedText}"`,
    });
  } catch (error) {
    console.error("Braille API error:", error);
    return NextResponse.json(
      { error: "Failed to process braille image" },
      { status: 500 }
    );
  }
}

/**
 * Use Google Gemini Vision API directly to read braille
 */
async function detectBrailleWithGemini(imageBase64: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Strip data URL prefix if present
  let base64Data = imageBase64;
  let mimeType = "image/jpeg";
  if (imageBase64.includes(",")) {
    const parts = imageBase64.split(",");
    const header = parts[0];
    base64Data = parts[1];
    const mimeMatch = header.match(/data:([^;]+)/);
    if (mimeMatch) mimeType = mimeMatch[1];
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are a braille recognition expert. Analyze this image carefully.

If this image contains braille text (raised dots arranged in cells of 2 columns x 3 rows):
1. Identify each braille cell in the image
2. Translate each cell to its corresponding letter, number, or symbol
3. Return ONLY the translated plain text, nothing else

If this image contains braille numbers:
1. Look for the number indicator (dots 3,4,5,6) followed by letter patterns
2. Translate: a=1, b=2, c=3, d=4, e=5, f=6, g=7, h=8, i=9, j=0
3. Return ONLY the numbers

If no braille is detected in the image, respond with exactly: NO_BRAILLE_DETECTED

Important: Return ONLY the translated text. No explanations, no formatting, no quotes.`,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (text === "NO_BRAILLE_DETECTED") {
    return "";
  }

  return text;
}
