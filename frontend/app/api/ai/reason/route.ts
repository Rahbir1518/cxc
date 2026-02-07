import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { 
  Route, 
  NavigationInstruction, 
  DetectedObject, 
  VoiceCommand,
  AIResponse 
} from '@/types/navigation';
import { v4 as uuidv4 } from 'uuid';

/**
 * AI Reasoning Endpoint - Gemini Integration
 * 
 * This endpoint handles:
 * 1. Converting raw routes to natural, human-friendly instructions
 * 2. Interpreting detected objects and providing contextual warnings
 * 3. Processing voice commands and determining intent
 * 4. Prioritizing and reranking instructions based on urgency
 */

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// System prompts for different tasks
const NAVIGATION_SYSTEM_PROMPT = `You are a calm, helpful indoor navigation assistant for visually impaired users. 
Your role is to provide clear, concise, and reassuring navigation instructions.

Guidelines:
- Use simple, directional language (left, right, straight, about-face)
- Describe distances in steps or approximate meters ("about 10 steps", "around 5 meters")
- Reference landmarks and tactile cues when available
- Speak calmly and reassuringly, never rush
- Warn about obstacles before they become dangerous
- Prioritize safety over speed
- If uncertain, recommend pausing and asking for assistance
- Use natural conversational language, not robotic commands

You communicate primarily through spoken text, so:
- Avoid visual descriptions like "you'll see"
- Use phrases like "you'll find", "on your left", "ahead of you"
- Pause naturally between instructions
- Give one clear instruction at a time`;

const SCENE_INTERPRETATION_PROMPT = `You are analyzing a scene for a visually impaired user navigating indoors.
Given detected objects with their positions and distances, provide:
1. A brief, calm description of the immediate environment
2. Any safety warnings (obstacles, people approaching, etc.)
3. Relevant navigation cues

Focus on:
- Objects directly in the path
- Potential hazards (furniture, steps, doors)
- Helpful landmarks for orientation
- People or moving obstacles

Keep descriptions concise (1-2 sentences max per point).`;

const INTENT_CLASSIFICATION_PROMPT = `You are classifying voice commands for an indoor navigation system.
Given a transcript, determine the user's intent and extract relevant entities.

Possible intents:
- navigate_to: User wants to go somewhere (extract destination)
- where_am_i: User wants current location
- repeat_instruction: User wants the last instruction repeated
- next_instruction: User wants the next step
- stop_navigation: User wants to stop/pause navigation
- find_nearest: User wants nearest amenity (extract type: restroom, elevator, exit)
- help: User needs assistance
- emergency: User is in distress or danger
- unknown: Cannot determine intent

Respond in JSON format:
{
  "intent": "intent_name",
  "entities": { "key": "value" },
  "confidence": 0.0-1.0
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'enhance_instructions':
        return handleEnhanceInstructions(body);
      case 'interpret_scene':
        return handleInterpretScene(body);
      case 'classify_intent':
        return handleClassifyIntent(body);
      case 'prioritize':
        return handlePrioritize(body);
      case 'generate_response':
        return handleGenerateResponse(body);
      default:
        return NextResponse.json(
          { error: 'Unknown action', validActions: ['enhance_instructions', 'interpret_scene', 'classify_intent', 'prioritize', 'generate_response'] },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('AI reason error:', error);
    return NextResponse.json(
      { error: 'AI processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Enhance navigation instructions with more natural language
 */
async function handleEnhanceInstructions(body: {
  route: Route;
  userContext?: {
    walkingPace?: 'slow' | 'normal' | 'fast';
    preferDetailedInstructions?: boolean;
    familiarWithBuilding?: boolean;
  };
}) {
  const { route, userContext } = body;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${NAVIGATION_SYSTEM_PROMPT}

Given this route with basic instructions, enhance them to be more natural and helpful for a visually impaired user.

Route summary:
- Start: ${route.startNode}
- End: ${route.endNode}
- Total distance: ${route.totalDistance} meters
- Estimated time: ${Math.ceil(route.estimatedTime / 60)} minutes

User context:
- Walking pace: ${userContext?.walkingPace ?? 'normal'}
- Prefers detailed instructions: ${userContext?.preferDetailedInstructions ?? true}
- Familiar with building: ${userContext?.familiarWithBuilding ?? false}

Basic instructions:
${route.instructions.map((inst, i) => `${i + 1}. ${inst.description}`).join('\n')}

Provide enhanced spoken instructions as a JSON array:
[
  {
    "stepNumber": 1,
    "spokenText": "enhanced instruction text",
    "priority": "normal" | "important" | "critical"
  }
]`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  // Parse JSON from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Return original instructions if parsing fails
    return NextResponse.json({
      success: true,
      instructions: route.instructions,
      enhanced: false,
    });
  }

  try {
    const enhancedInstructions = JSON.parse(jsonMatch[0]);
    
    // Merge enhanced text with original instructions
    const mergedInstructions = route.instructions.map((original, index) => {
      const enhanced = enhancedInstructions.find((e: { stepNumber: number }) => e.stepNumber === index + 1);
      return {
        ...original,
        spokenText: enhanced?.spokenText ?? original.spokenText,
        priority: enhanced?.priority ?? original.priority,
      };
    });

    return NextResponse.json({
      success: true,
      instructions: mergedInstructions,
      enhanced: true,
    });
  } catch {
    return NextResponse.json({
      success: true,
      instructions: route.instructions,
      enhanced: false,
    });
  }
}

/**
 * Interpret detected scene objects and provide context
 */
async function handleInterpretScene(body: {
  detections: DetectedObject[];
  currentInstruction?: NavigationInstruction;
  userHeading?: number;
}) {
  const { detections, currentInstruction, userHeading } = body;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Filter to relevant detections
  const relevantDetections = detections
    .filter(d => d.depth && d.depth < 5) // Within 5 meters
    .sort((a, b) => (a.depth ?? 10) - (b.depth ?? 10));

  if (relevantDetections.length === 0) {
    return NextResponse.json({
      success: true,
      description: 'The path ahead appears clear.',
      warnings: [],
      spokenText: 'The path ahead is clear.',
    });
  }

  const prompt = `${SCENE_INTERPRETATION_PROMPT}

Detected objects (sorted by distance):
${relevantDetections.map(d => 
  `- ${d.label}: ${d.direction}, ${d.depth?.toFixed(1)}m away, confidence: ${(d.confidence * 100).toFixed(0)}%${d.isHazard ? ' [HAZARD]' : ''}`
).join('\n')}

User is currently: ${currentInstruction?.spokenText ?? 'navigating'}
User heading: ${userHeading ?? 'unknown'}°

Provide a response as JSON:
{
  "description": "Brief scene description",
  "warnings": ["warning 1", "warning 2"],
  "spokenText": "What to say to the user (1-2 sentences max)",
  "priority": "low" | "normal" | "high" | "urgent"
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({
      success: true,
      description: 'Unable to interpret scene.',
      warnings: [],
      spokenText: '',
    });
  }

  try {
    const interpretation = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      success: true,
      ...interpretation,
    });
  } catch {
    return NextResponse.json({
      success: true,
      description: 'Unable to interpret scene.',
      warnings: [],
      spokenText: '',
    });
  }
}

/**
 * Classify user voice command intent
 */
async function handleClassifyIntent(body: {
  transcript: string;
  conversationContext?: string[];
}) {
  const { transcript, conversationContext } = body;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${INTENT_CLASSIFICATION_PROMPT}

User said: "${transcript}"

${conversationContext?.length ? `Recent conversation:\n${conversationContext.slice(-3).join('\n')}` : ''}

Respond with JSON only.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({
      success: true,
      intent: 'unknown',
      entities: {},
      confidence: 0.5,
      rawTranscript: transcript,
    });
  }

  try {
    const classification = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      success: true,
      ...classification,
      rawTranscript: transcript,
    });
  } catch {
    return NextResponse.json({
      success: true,
      intent: 'unknown',
      entities: {},
      confidence: 0.5,
      rawTranscript: transcript,
    });
  }
}

/**
 * Prioritize and potentially interrupt with urgent information
 */
async function handlePrioritize(body: {
  pendingInstructions: NavigationInstruction[];
  sceneWarnings: string[];
  currentNavState: 'navigating' | 'paused' | 'idle';
}) {
  const { pendingInstructions, sceneWarnings, currentNavState } = body;
  
  // Determine if any warning requires immediate interrupt
  const urgentWarnings = sceneWarnings.filter(w => 
    w.toLowerCase().includes('stop') ||
    w.toLowerCase().includes('danger') ||
    w.toLowerCase().includes('caution') ||
    w.toLowerCase().includes('obstacle')
  );

  const response: AIResponse = {
    id: uuidv4(),
    type: urgentWarnings.length > 0 ? 'warning' : 'instruction',
    text: urgentWarnings.length > 0 
      ? urgentWarnings[0] 
      : pendingInstructions[0]?.description ?? 'No pending instructions.',
    spokenText: urgentWarnings.length > 0 
      ? urgentWarnings[0] 
      : pendingInstructions[0]?.spokenText ?? '',
    priority: urgentWarnings.length > 0 ? 'urgent' : 'normal',
    interruptCurrent: urgentWarnings.length > 0,
    metadata: {
      confidence: 0.9,
      reasoning: urgentWarnings.length > 0 
        ? 'Urgent safety warning detected' 
        : 'Standard navigation instruction',
    },
  };

  return NextResponse.json({
    success: true,
    response,
    shouldInterrupt: urgentWarnings.length > 0,
    currentNavState,
  });
}

/**
 * Generate a conversational response to user queries
 */
async function handleGenerateResponse(body: {
  intent: VoiceCommand;
  navigationState?: {
    currentStep?: number;
    totalSteps?: number;
    currentInstruction?: NavigationInstruction;
    destination?: string;
  };
  buildingName?: string;
}) {
  const { intent, navigationState, buildingName } = body;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${NAVIGATION_SYSTEM_PROMPT}

The user has asked something. Generate a helpful, calm spoken response.

User intent: ${intent.intent}
User said: "${intent.rawTranscript}"
${intent.entities ? `Entities: ${JSON.stringify(intent.entities)}` : ''}

Current navigation state:
- Building: ${buildingName ?? 'Unknown building'}
- Current step: ${navigationState?.currentStep ?? 'N/A'} of ${navigationState?.totalSteps ?? 'N/A'}
- Current instruction: ${navigationState?.currentInstruction?.spokenText ?? 'None'}
- Destination: ${navigationState?.destination ?? 'Not set'}

Generate a spoken response (1-3 sentences, natural and calm). Respond as plain text only.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text().trim();

  const response: AIResponse = {
    id: uuidv4(),
    type: intent.intent === 'help' ? 'information' : 'instruction',
    text: responseText,
    spokenText: responseText,
    priority: intent.intent === 'emergency' ? 'urgent' : 'normal',
    interruptCurrent: intent.intent === 'emergency',
    metadata: {
      confidence: intent.confidence,
      reasoning: `Response to ${intent.intent} intent`,
    },
  };

  return NextResponse.json({
    success: true,
    response,
  });
}
