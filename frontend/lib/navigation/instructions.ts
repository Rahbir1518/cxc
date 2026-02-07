import type { 
  Route, 
  RouteNode, 
  NavigationInstruction, 
  InstructionAction,
  IndoorMap,
  MapNode,
  Coordinates
} from '@/types/navigation';
import { v4 as uuidv4 } from 'uuid';

/**
 * Instruction Generator for Indoor Navigation
 * 
 * Converts route paths into human-friendly, TTS-optimized instructions.
 * Designed for visually impaired users - emphasizes:
 * - Clear directional cues
 * - Landmark references
 * - Distance in steps (not meters)
 * - Warnings for obstacles/hazards
 */

// Average step length in meters
const STEP_LENGTH_METERS = 0.75;

// Direction thresholds (in degrees)
const TURN_THRESHOLD = 30;  // Anything less is "continue straight"
const SLIGHT_TURN_THRESHOLD = 60;  // Slight left/right

/**
 * Calculate angle between two vectors
 */
function calculateAngle(from: Coordinates, to: Coordinates): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Convert to degrees, 0 = North (positive Y)
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

/**
 * Calculate turn direction between two segments
 */
function calculateTurn(
  prev: Coordinates, 
  current: Coordinates, 
  next: Coordinates
): { action: InstructionAction; angleDiff: number } {
  const incomingAngle = calculateAngle(prev, current);
  const outgoingAngle = calculateAngle(current, next);
  
  // Calculate the difference, normalized to -180 to 180
  let angleDiff = outgoingAngle - incomingAngle;
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;
  
  const absAngle = Math.abs(angleDiff);
  
  if (absAngle < TURN_THRESHOLD) {
    return { action: 'go_straight', angleDiff };
  } else if (absAngle < SLIGHT_TURN_THRESHOLD) {
    return { 
      action: angleDiff > 0 ? 'slight_right' : 'slight_left', 
      angleDiff 
    };
  } else if (absAngle < 150) {
    return { 
      action: angleDiff > 0 ? 'turn_right' : 'turn_left', 
      angleDiff 
    };
  } else {
    return { action: 'turn_around', angleDiff };
  }
}

/**
 * Convert meters to steps (rounded)
 */
function metersToSteps(meters: number): number {
  return Math.round(meters / STEP_LENGTH_METERS);
}

/**
 * Format distance for speech
 */
function formatDistance(meters: number): string {
  const steps = metersToSteps(meters);
  if (steps <= 2) {
    return 'a couple of steps';
  } else if (steps <= 5) {
    return 'a few steps';
  } else if (steps <= 10) {
    return `about ${steps} steps`;
  } else if (steps <= 20) {
    return `about ${Math.round(steps / 5) * 5} steps`;
  } else {
    // Use meters for longer distances
    const roundedMeters = Math.round(meters / 5) * 5;
    return `about ${roundedMeters} meters`;
  }
}

/**
 * Get landmark description for a node
 */
function getLandmarkDescription(node: MapNode): string | undefined {
  if (node.metadata?.landmarks && node.metadata.landmarks.length > 0) {
    return node.metadata.landmarks[0];
  }
  
  switch (node.type) {
    case 'door':
      return node.metadata?.roomNumber 
        ? `door to room ${node.metadata.roomNumber}` 
        : 'a door';
    case 'elevator':
      return 'the elevator';
    case 'stairs':
      return 'the stairs';
    case 'restroom':
      return 'the restroom';
    case 'intersection':
      return 'the intersection';
    case 'exit':
      return 'the exit';
    default:
      return undefined;
  }
}

/**
 * Generate spoken instruction for a turn action
 */
function generateTurnSpoken(
  action: InstructionAction,
  distance: number,
  landmark?: string
): string {
  const distancePhrase = formatDistance(distance);
  
  let direction = '';
  switch (action) {
    case 'turn_left':
      direction = 'turn left';
      break;
    case 'turn_right':
      direction = 'turn right';
      break;
    case 'slight_left':
      direction = 'bear slightly left';
      break;
    case 'slight_right':
      direction = 'bear slightly right';
      break;
    case 'go_straight':
    case 'walk_forward':
      direction = 'continue straight';
      break;
    case 'turn_around':
      direction = 'turn around';
      break;
    default:
      direction = action.replace(/_/g, ' ');
  }
  
  if (landmark) {
    return `Walk ${distancePhrase}, then ${direction} at ${landmark}.`;
  } else {
    return `Walk ${distancePhrase}, then ${direction}.`;
  }
}

/**
 * Generate instructions from a route
 */
export function generateInstructions(
  route: Route,
  map: IndoorMap
): NavigationInstruction[] {
  const instructions: NavigationInstruction[] = [];
  const path = route.path;
  
  if (path.length < 2) {
    return instructions;
  }
  
  // Build node lookup
  const nodeMap = new Map<string, MapNode>();
  for (const node of map.nodes) {
    nodeMap.set(node.id, node);
  }
  
  let stepNumber = 1;
  
  // Starting instruction
  const startNode = nodeMap.get(path[0].nodeId);
  const secondNode = nodeMap.get(path[1].nodeId);
  
  if (startNode && secondNode) {
    const startLandmark = getLandmarkDescription(startNode);
    const heading = calculateAngle(startNode.coordinates, secondNode.coordinates);
    const compassDirection = getCompassDirection(heading);
    
    instructions.push({
      id: uuidv4(),
      stepNumber: stepNumber++,
      action: 'start',
      description: `Start navigation from ${startNode.name}. Head ${compassDirection}.`,
      spokenText: startLandmark 
        ? `Starting navigation from ${startLandmark}. Begin walking ${compassDirection}.`
        : `Starting navigation. Begin walking ${compassDirection}.`,
      priority: 'normal',
    });
  }

  // Process path segments
  let accumulatedDistance = 0;
  let segmentStartIndex = 0;
  
  for (let i = 1; i < path.length - 1; i++) {
    const prevNode = nodeMap.get(path[i - 1].nodeId);
    const currentNode = nodeMap.get(path[i].nodeId);
    const nextNode = nodeMap.get(path[i + 1].nodeId);
    
    if (!prevNode || !currentNode || !nextNode) continue;
    
    // Calculate segment distance
    const segmentDistance = path[i].distanceFromStart - path[i - 1].distanceFromStart;
    accumulatedDistance += segmentDistance;
    
    // Calculate turn at this node
    const turn = calculateTurn(
      prevNode.coordinates,
      currentNode.coordinates,
      nextNode.coordinates
    );
    
    // Check if this is a significant waypoint
    const isSignificantNode = 
      currentNode.type === 'door' ||
      currentNode.type === 'elevator' ||
      currentNode.type === 'stairs' ||
      currentNode.type === 'intersection' ||
      turn.action !== 'go_straight';
    
    if (isSignificantNode) {
      const landmark = getLandmarkDescription(currentNode);
      
      // Generate instruction
      let instruction: NavigationInstruction;
      
      if (currentNode.type === 'elevator') {
        instruction = {
          id: uuidv4(),
          stepNumber: stepNumber++,
          action: 'take_elevator',
          description: `Walk ${formatDistance(accumulatedDistance)} to the elevator.`,
          spokenText: `Walk ${formatDistance(accumulatedDistance)} to reach the elevator.`,
          distance: accumulatedDistance,
          landmark: 'elevator',
          priority: 'important',
        };
      } else if (currentNode.type === 'stairs') {
        const goingUp = nextNode.coordinates.floor > currentNode.coordinates.floor;
        instruction = {
          id: uuidv4(),
          stepNumber: stepNumber++,
          action: goingUp ? 'take_stairs_up' : 'take_stairs_down',
          description: `Walk ${formatDistance(accumulatedDistance)} to the stairs. Go ${goingUp ? 'up' : 'down'}.`,
          spokenText: `Walk ${formatDistance(accumulatedDistance)} to the stairs, then go ${goingUp ? 'up' : 'down'}.`,
          distance: accumulatedDistance,
          landmark: 'stairs',
          priority: 'important',
        };
      } else if (currentNode.type === 'door') {
        instruction = {
          id: uuidv4(),
          stepNumber: stepNumber++,
          action: 'enter_door',
          description: `Walk ${formatDistance(accumulatedDistance)} and enter through ${currentNode.name}.`,
          spokenText: generateTurnSpoken(turn.action, accumulatedDistance, landmark),
          distance: accumulatedDistance,
          landmark: currentNode.metadata?.roomNumber,
          priority: 'normal',
        };
      } else {
        instruction = {
          id: uuidv4(),
          stepNumber: stepNumber++,
          action: turn.action,
          description: `Walk ${formatDistance(accumulatedDistance)} and ${turn.action.replace(/_/g, ' ')}.`,
          spokenText: generateTurnSpoken(turn.action, accumulatedDistance, landmark),
          distance: accumulatedDistance,
          landmark,
          priority: turn.action === 'turn_around' ? 'important' : 'normal',
        };
      }
      
      instructions.push(instruction);
      accumulatedDistance = 0;
      segmentStartIndex = i;
    }
  }
  
  // Final segment to destination
  const lastNode = nodeMap.get(path[path.length - 1].nodeId);
  const secondLastNode = nodeMap.get(path[path.length - 2].nodeId);
  
  if (lastNode && secondLastNode) {
    const finalDistance = path[path.length - 1].distanceFromStart - path[path.length - 2].distanceFromStart;
    accumulatedDistance += finalDistance;
    
    const landmark = getLandmarkDescription(lastNode);
    const roomNumber = lastNode.metadata?.roomNumber;
    
    instructions.push({
      id: uuidv4(),
      stepNumber: stepNumber++,
      action: 'arrive',
      description: `Walk ${formatDistance(accumulatedDistance)} to arrive at ${lastNode.name}.`,
      spokenText: roomNumber 
        ? `Walk ${formatDistance(accumulatedDistance)}. Your destination, room ${roomNumber}, will be on your ${getRelativeDirection(secondLastNode.coordinates, lastNode.coordinates)}.`
        : `Walk ${formatDistance(accumulatedDistance)} to reach your destination.`,
      distance: accumulatedDistance,
      landmark: roomNumber ?? landmark,
      priority: 'important',
    });
  }
  
  return instructions;
}

/**
 * Get compass direction from angle
 */
function getCompassDirection(angle: number): string {
  const directions = [
    'north', 'northeast', 'east', 'southeast',
    'south', 'southwest', 'west', 'northwest'
  ];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
}

/**
 * Get relative direction (left/right) based on approach angle
 */
function getRelativeDirection(from: Coordinates, to: Coordinates): string {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 2) {
    return 'ahead';
  }
  return dx > 0 ? 'right' : 'left';
}

/**
 * Simplify instructions by merging consecutive straight segments
 */
export function simplifyInstructions(
  instructions: NavigationInstruction[]
): NavigationInstruction[] {
  const simplified: NavigationInstruction[] = [];
  
  for (const instruction of instructions) {
    const last = simplified[simplified.length - 1];
    
    // Merge consecutive go_straight/walk_forward instructions
    if (
      last &&
      (last.action === 'go_straight' || last.action === 'walk_forward') &&
      (instruction.action === 'go_straight' || instruction.action === 'walk_forward')
    ) {
      const combinedDistance = (last.distance ?? 0) + (instruction.distance ?? 0);
      last.distance = combinedDistance;
      last.description = `Continue straight for ${formatDistance(combinedDistance)}.`;
      last.spokenText = `Continue walking straight for ${formatDistance(combinedDistance)}.`;
    } else {
      simplified.push({ ...instruction });
    }
  }
  
  return simplified;
}

/**
 * Add hazard warnings to instructions based on map alerts
 */
export function addHazardWarnings(
  instructions: NavigationInstruction[],
  map: IndoorMap,
  currentPath: RouteNode[]
): NavigationInstruction[] {
  const result = [...instructions];
  
  // Get nodes along the path
  const pathNodeIds = new Set(currentPath.map(n => n.nodeId));
  
  // Check for alerts affecting path nodes
  for (const alert of map.alerts ?? []) {
    for (const nodeId of alert.affectedNodes) {
      if (pathNodeIds.has(nodeId)) {
        // Find the instruction closest to this node
        const nodeIndex = currentPath.findIndex(n => n.nodeId === nodeId);
        
        if (nodeIndex >= 0) {
          // Insert a caution instruction before this step
          const cautionInstruction: NavigationInstruction = {
            id: uuidv4(),
            stepNumber: 0, // Will be renumbered
            action: 'caution',
            description: `Caution: ${alert.message}`,
            spokenText: `Caution ahead. ${alert.message}`,
            priority: alert.severity === 'critical' ? 'critical' : 'important',
          };
          
          result.splice(nodeIndex, 0, cautionInstruction);
        }
      }
    }
  }
  
  // Renumber steps
  result.forEach((instruction, index) => {
    instruction.stepNumber = index + 1;
  });
  
  return result;
}

/**
 * Generate a natural language summary of the route
 */
export function generateRouteSummary(route: Route, map: IndoorMap): string {
  const startNode = map.nodes.find(n => n.id === route.startNode);
  const endNode = map.nodes.find(n => n.id === route.endNode);
  
  if (!startNode || !endNode) {
    return 'Route summary unavailable.';
  }
  
  const distancePhrase = formatDistance(route.totalDistance);
  const timeMinutes = Math.ceil(route.estimatedTime / 60);
  const timePhrase = timeMinutes <= 1 ? 'about a minute' : `about ${timeMinutes} minutes`;
  
  const startName = startNode.metadata?.roomNumber ?? startNode.name;
  const endName = endNode.metadata?.roomNumber ?? endNode.name;
  
  return `Route from ${startName} to ${endName}. Total distance is ${distancePhrase}, taking ${timePhrase} to walk.`;
}

export default {
  generateInstructions,
  simplifyInstructions,
  addHazardWarnings,
  generateRouteSummary,
};
