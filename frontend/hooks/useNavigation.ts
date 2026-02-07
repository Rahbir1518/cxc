'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { 
  Route, 
  NavigationInstruction, 
  MapNode, 
  IndoorMap,
  VoiceIntent,
} from '@/types/navigation';
import { findPath } from '@/lib/navigation/routing';
import { generateInstructions } from '@/lib/navigation/instructions';
import { scienceTeachingComplexBasement } from '@/lib/maps';

interface UseNavigationOptions {
  map?: IndoorMap;
  onInstructionChange?: (instruction: NavigationInstruction) => void;
  onRouteComplete?: () => void;
  onError?: (error: string) => void;
}

interface UseNavigationReturn {
  // State
  isNavigating: boolean;
  currentRoute: Route | null;
  currentInstruction: NavigationInstruction | null;
  currentStepIndex: number;
  destination: MapNode | null;
  availableDestinations: MapNode[];
  
  // Actions
  startNavigation: (destinationId: string, startId?: string) => Promise<void>;
  stopNavigation: () => void;
  nextInstruction: () => void;
  previousInstruction: () => void;
  repeatInstruction: () => NavigationInstruction | null;
  
  // AI Integration
  processVoiceCommand: (transcript: string) => Promise<ProcessedCommand>;
  
  // Utilities
  getLocationById: (id: string) => MapNode | undefined;
  findNearestOfType: (type: string, fromId?: string) => MapNode | null;
}

interface ProcessedCommand {
  intent: VoiceIntent;
  response: string;
  action?: () => void;
  destination?: MapNode;
}

/**
 * Hook for indoor navigation functionality
 * Handles routing, instruction management, and voice command processing
 */
export function useNavigation({
  map = scienceTeachingComplexBasement,
  onInstructionChange,
  onRouteComplete,
  onError,
}: UseNavigationOptions = {}): UseNavigationReturn {
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [destination, setDestination] = useState<MapNode | null>(null);
  
  const mapRef = useRef(map);
  mapRef.current = map;

  // Get available destinations (rooms, restrooms, exits, etc.)
  const availableDestinations = map?.nodes?.filter(
    (node) => ['room', 'restroom', 'exit', 'entrance', 'elevator'].includes(node.type)
  ) ?? [];

  // Current instruction
  const currentInstruction = currentRoute?.instructions[currentStepIndex] ?? null;

  // Notify on instruction change
  useEffect(() => {
    if (currentInstruction) {
      onInstructionChange?.(currentInstruction);
    }
  }, [currentInstruction, onInstructionChange]);

  // Check for route completion
  useEffect(() => {
    if (currentRoute && currentStepIndex >= currentRoute.instructions.length - 1) {
      const lastInstruction = currentRoute.instructions[currentRoute.instructions.length - 1];
      if (lastInstruction?.action === 'arrive') {
        onRouteComplete?.();
      }
    }
  }, [currentRoute, currentStepIndex, onRouteComplete]);

  // Get node by ID
  const getLocationById = useCallback(
    (id: string): MapNode | undefined => {
      return mapRef.current?.nodes?.find((n) => n.id === id);
    },
    []
  );

  // Find nearest node of a specific type
  const findNearestOfType = useCallback(
    (type: string, fromId?: string): MapNode | null => {
      const nodes = mapRef.current?.nodes?.filter((n) => n.type === type || n.name.toLowerCase().includes(type.toLowerCase())) ?? [];
      if (nodes.length === 0) return null;
      
      // For now, just return the first match
      // In a full implementation, calculate actual distance
      return nodes[0];
    },
    []
  );

  // Start navigation to a destination
  const startNavigation = useCallback(
    async (destinationId: string, startId?: string): Promise<void> => {
      try {
        // Default start position (main entrance or first intersection)
        const defaultStart = mapRef.current?.nodes?.find(
          (n) => n.type === 'entrance' || n.type === 'intersection'
        );
        const startNodeId = startId || defaultStart?.id;

        if (!startNodeId) {
          throw new Error('No starting position available');
        }

        const destNode = getLocationById(destinationId);
        if (!destNode) {
          throw new Error(`Destination not found: ${destinationId}`);
        }

        // Generate route
        const route = findPath(mapRef.current, startNodeId, destinationId);

        if (!route) {
          throw new Error('Could not find a route to the destination');
        }

        // Generate human-friendly instructions
        const enhancedRoute = generateInstructions(route, mapRef.current);

        setCurrentRoute(enhancedRoute);
        setCurrentStepIndex(0);
        setDestination(destNode);
        setIsNavigating(true);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Navigation failed';
        onError?.(message);
        throw error;
      }
    },
    [getLocationById, onError]
  );

  // Stop navigation
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setCurrentRoute(null);
    setCurrentStepIndex(0);
    setDestination(null);
  }, []);

  // Move to next instruction
  const nextInstruction = useCallback(() => {
    if (!currentRoute) return;
    
    if (currentStepIndex < currentRoute.instructions.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [currentRoute, currentStepIndex]);

  // Move to previous instruction
  const previousInstruction = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  // Repeat current instruction
  const repeatInstruction = useCallback((): NavigationInstruction | null => {
    return currentInstruction;
  }, [currentInstruction]);

  // Process voice commands using AI
  const processVoiceCommand = useCallback(
    async (transcript: string): Promise<ProcessedCommand> => {
      const lowerTranscript = transcript.toLowerCase().trim();

      // Simple intent detection (will be enhanced by AI)
      // Navigate commands
      if (lowerTranscript.includes('go to') || lowerTranscript.includes('take me to') || lowerTranscript.includes('navigate to')) {
        // Extract destination
        const destMatch = lowerTranscript.match(/(?:go to|take me to|navigate to)\s+(.+)/i);
        if (destMatch) {
          const destName = destMatch[1].trim();
          
          // Find matching destination
          const dest = availableDestinations.find(
            (n) => n.name.toLowerCase().includes(destName) ||
                   n.metadata?.roomNumber?.toLowerCase() === destName
          );

          if (dest) {
            return {
              intent: 'navigate_to',
              response: `Starting navigation to ${dest.name}`,
              destination: dest,
              action: () => startNavigation(dest.id),
            };
          } else {
            return {
              intent: 'navigate_to',
              response: `I couldn't find a location matching "${destName}". Please try again with a specific room number or name.`,
            };
          }
        }
      }

      // Where am I
      if (lowerTranscript.includes('where am i') || lowerTranscript.includes('my location')) {
        const location = destination ? `You're heading to ${destination.name}` : 'You are in the Science Teaching Complex basement';
        return {
          intent: 'where_am_i',
          response: location,
        };
      }

      // Repeat instruction
      if (lowerTranscript.includes('repeat') || lowerTranscript.includes('say again') || lowerTranscript.includes('what did you say')) {
        const instruction = repeatInstruction();
        return {
          intent: 'repeat_instruction',
          response: instruction?.spokenText || 'No current instruction to repeat',
        };
      }

      // Next instruction
      if (lowerTranscript.includes('next') || lowerTranscript.includes('continue')) {
        if (currentRoute) {
          return {
            intent: 'next_instruction',
            response: currentRoute.instructions[currentStepIndex + 1]?.spokenText || 'You have reached your destination',
            action: nextInstruction,
          };
        }
      }

      // Stop navigation
      if (lowerTranscript.includes('stop') || lowerTranscript.includes('cancel') || lowerTranscript.includes('end navigation')) {
        return {
          intent: 'stop_navigation',
          response: 'Navigation stopped',
          action: stopNavigation,
        };
      }

      // Find nearest
      if (lowerTranscript.includes('nearest') || lowerTranscript.includes('closest')) {
        if (lowerTranscript.includes('restroom') || lowerTranscript.includes('bathroom') || lowerTranscript.includes('washroom')) {
          const nearest = findNearestOfType('restroom');
          if (nearest) {
            return {
              intent: 'find_nearest',
              response: `The nearest restroom is ${nearest.name}. Would you like me to navigate there?`,
              destination: nearest,
            };
          }
        }
        if (lowerTranscript.includes('exit') || lowerTranscript.includes('way out')) {
          const nearest = findNearestOfType('exit');
          if (nearest) {
            return {
              intent: 'find_nearest',
              response: `The nearest exit is ${nearest.name}. Would you like directions?`,
              destination: nearest,
            };
          }
        }
        if (lowerTranscript.includes('elevator')) {
          const nearest = findNearestOfType('elevator');
          if (nearest) {
            return {
              intent: 'find_nearest',
              response: `The nearest elevator is at ${nearest.name}`,
              destination: nearest,
            };
          }
        }
      }

      // Help
      if (lowerTranscript.includes('help') || lowerTranscript.includes('what can you do')) {
        return {
          intent: 'help',
          response: 'I can help you navigate indoors. Try saying: "Take me to room 0806", "Where is the nearest restroom", "Next instruction", or "Stop navigation".',
        };
      }

      // Unknown intent - use AI for more sophisticated processing
      try {
        const response = await fetch('/api/ai/reason', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'classify_intent',
            transcript,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          return {
            intent: result.intent || 'unknown',
            response: result.response || "I'm not sure what you mean. Try asking for directions to a specific room.",
          };
        }
      } catch {
        // AI call failed, use fallback
      }

      return {
        intent: 'unknown',
        response: "I didn't understand that. Try saying 'help' to learn what I can do.",
      };
    },
    [availableDestinations, currentRoute, currentStepIndex, destination, findNearestOfType, nextInstruction, repeatInstruction, startNavigation, stopNavigation]
  );

  return {
    isNavigating,
    currentRoute,
    currentInstruction,
    currentStepIndex,
    destination,
    availableDestinations,
    startNavigation,
    stopNavigation,
    nextInstruction,
    previousInstruction,
    repeatInstruction,
    processVoiceCommand,
    getLocationById,
    findNearestOfType,
  };
}

export default useNavigation;
