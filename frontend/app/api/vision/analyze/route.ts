import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DetectedObject } from '@/types/navigation';
import { v4 as uuidv4 } from 'uuid';

/**
 * Vision Analysis API
 * 
 * Analyzes camera frames to detect objects, obstacles, and hazards.
 * Uses Gemini Vision for scene understanding when backend CV is not available.
 */

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SCENE_ANALYSIS_PROMPT = `You are analyzing an image for a visually impaired person navigating indoors.
Identify objects in the scene that are relevant for safe navigation.

For each significant object, provide:
1. label: What the object is (person, door, chair, table, stairs, wall, etc.)
2. direction: Where it is in the frame (left, center, right)
3. isHazard: Whether it could be an obstacle or danger (true/false)
4. confidence: Your confidence level (0.0 to 1.0)

Focus on:
- Obstacles in the walking path
- People who might be moving
- Doors and entrances
- Stairs or elevation changes
- Furniture that could block movement
- Signs or landmarks

Respond ONLY with a JSON array of objects. Example:
[
  {"label": "person", "direction": "center", "isHazard": false, "confidence": 0.9},
  {"label": "chair", "direction": "left", "isHazard": true, "confidence": 0.85}
]

If the image is unclear or you cannot identify objects, respond with: []`;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle form data (image upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File | null;

      if (!imageFile) {
        return NextResponse.json(
          { error: 'No image provided' },
          { status: 400 }
        );
      }

      // Check if Gemini API key is available
      if (!process.env.GEMINI_API_KEY) {
        // Return mock data for testing without API
        return NextResponse.json({
          success: true,
          detections: getMockDetections(),
          processingTime: 150,
          source: 'mock',
        });
      }

      // Convert image to base64
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = imageFile.type || 'image/jpeg';

      // Analyze with Gemini Vision
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const result = await model.generateContent([
        SCENE_ANALYSIS_PROMPT,
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
      ]);

      const response = result.response.text();
      
      // Parse the JSON response
      let detections: DetectedObject[] = [];
      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          detections = parsed.map((item: { label: string; direction: string; isHazard: boolean; confidence: number }, index: number) => ({
            id: uuidv4(),
            label: item.label || 'unknown',
            confidence: item.confidence || 0.5,
            boundingBox: {
              x: item.direction === 'left' ? 50 : item.direction === 'right' ? 400 : 200,
              y: 100 + index * 80,
              width: 100,
              height: 100,
            },
            direction: item.direction as 'left' | 'center' | 'right',
            isHazard: item.isHazard || false,
          }));
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
      }

      return NextResponse.json({
        success: true,
        detections,
        processingTime: Date.now(),
        source: 'gemini',
      });
    }

    // Handle JSON requests (for testing)
    const body = await request.json();
    
    if (body.action === 'status') {
      return NextResponse.json({
        service: 'vision-analysis',
        status: process.env.GEMINI_API_KEY ? 'active' : 'mock-mode',
        provider: 'Gemini Vision',
        capabilities: ['object_detection', 'scene_understanding', 'hazard_detection'],
      });
    }

    return NextResponse.json(
      { error: 'Invalid request. Send image as multipart/form-data' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Vision analysis error:', error);
    return NextResponse.json(
      { error: 'Vision analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint for service status
export async function GET() {
  return NextResponse.json({
    service: 'vision-analysis',
    status: process.env.GEMINI_API_KEY ? 'active' : 'mock-mode',
    provider: 'Gemini Vision',
    capabilities: ['object_detection', 'scene_understanding', 'hazard_detection'],
    usage: 'POST image as multipart/form-data with key "image"',
  });
}

// Mock detections for testing without API
function getMockDetections(): DetectedObject[] {
  return [
    {
      id: uuidv4(),
      label: 'door',
      confidence: 0.92,
      boundingBox: { x: 250, y: 100, width: 140, height: 280 },
      direction: 'center',
      isHazard: false,
    },
    {
      id: uuidv4(),
      label: 'hallway',
      confidence: 0.88,
      boundingBox: { x: 100, y: 50, width: 400, height: 300 },
      direction: 'center',
      isHazard: false,
    },
  ];
}
