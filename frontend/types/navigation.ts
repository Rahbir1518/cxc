// Navigation types for indoor navigation system

// ====================
// Map Data Types
// ====================

export interface Coordinates {
  x: number;  // meters from origin (west edge)
  y: number;  // meters from origin (south edge)
  floor: number;  // floor level (0 = basement, 1 = ground, etc.)
}

export interface MapNode {
  id: string;
  name: string;
  type: NodeType;
  coordinates: Coordinates;
  accessible: boolean;  // wheelchair accessible
  connections: string[];  // IDs of connected nodes
  metadata?: {
    roomNumber?: string;
    description?: string;
    landmarks?: string[];  // nearby landmarks for orientation
    doorWidth?: number;  // meters
  };
}

export type NodeType = 
  | 'room'
  | 'door'
  | 'intersection'
  | 'hallway'
  | 'elevator'
  | 'stairs'
  | 'entrance'
  | 'exit'
  | 'restroom'
  | 'emergency_exit';

export interface MapEdge {
  id: string;
  from: string;  // node ID
  to: string;    // node ID
  distance: number;  // meters
  type: EdgeType;
  accessible: boolean;
  bidirectional: boolean;
  metadata?: {
    width?: number;  // hallway width in meters
    obstacles?: string[];
    hazards?: string[];
    temporaryClosure?: boolean;
    closureReason?: string;
  };
}

export type EdgeType = 
  | 'hallway'
  | 'stairs'
  | 'elevator'
  | 'ramp'
  | 'doorway'
  | 'outdoor';

export interface IndoorMap {
  id: string;
  buildingName: string;
  buildingNumber: string;
  floor: number;
  floorName: string;
  lastUpdated: string;
  origin: {
    latitude: number;
    longitude: number;
  };
  bounds: {
    width: number;   // meters
    height: number;  // meters
  };
  nodes: MapNode[];
  edges: MapEdge[];
  alerts?: MapAlert[];
}

export interface MapAlert {
  id: string;
  type: 'closure' | 'hazard' | 'construction' | 'event';
  affectedNodes: string[];
  affectedEdges: string[];
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  startTime?: string;
  endTime?: string;
}

// ====================
// Routing Types
// ====================

export interface RouteRequest {
  startNodeId: string;
  endNodeId: string;
  preferences?: RoutePreferences;
}

export interface RoutePreferences {
  avoidStairs: boolean;
  preferElevators: boolean;
  avoidCrowdedAreas: boolean;
  maxDistance?: number;  // meters
}

export interface RouteNode {
  nodeId: string;
  name: string;
  type: NodeType;
  coordinates: Coordinates;
  distanceFromStart: number;  // cumulative meters
  estimatedTimeFromStart: number;  // seconds at walking pace
}

export interface Route {
  id: string;
  startNode: string;
  endNode: string;
  totalDistance: number;  // meters
  estimatedTime: number;  // seconds
  path: RouteNode[];
  instructions: NavigationInstruction[];
  createdAt: string;
}

export interface NavigationInstruction {
  id: string;
  stepNumber: number;
  action: InstructionAction;
  description: string;  // Human-readable instruction
  spokenText: string;   // Optimized for TTS
  distance?: number;    // meters for this segment
  landmark?: string;    // reference point
  priority: 'normal' | 'important' | 'critical';
}

export type InstructionAction = 
  | 'start'
  | 'walk_forward'
  | 'turn_left'
  | 'turn_right'
  | 'turn_around'
  | 'slight_left'
  | 'slight_right'
  | 'go_straight'
  | 'take_elevator'
  | 'take_stairs_up'
  | 'take_stairs_down'
  | 'enter_door'
  | 'exit_door'
  | 'arrive'
  | 'caution';

// ====================
// Navigation State Types
// ====================

export interface NavigationState {
  sessionId: string;
  userId: string;
  currentRoute?: Route;
  currentStepIndex: number;
  estimatedPosition: Coordinates;
  lastKnownPosition?: Coordinates;
  heading: number;  // degrees, 0 = North
  status: NavigationStatus;
  startTime: string;
  lastUpdateTime: string;
}

export type NavigationStatus = 
  | 'idle'
  | 'planning'
  | 'navigating'
  | 'recalculating'
  | 'paused'
  | 'arrived'
  | 'error';

// ====================
// Vision/Detection Types
// ====================

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  depth?: number;  // estimated distance in meters
  direction: 'left' | 'center' | 'right';
  isHazard: boolean;
}

export interface VisionFrame {
  frameId: string;
  timestamp: string;
  detections: DetectedObject[];
  depthMap?: number[][];  // 2D depth values
  sceneDescription?: string;
}

// ====================
// Voice/Speech Types
// ====================

export interface SpeechTranscript {
  id: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: string;
}

export interface VoiceCommand {
  intent: VoiceIntent;
  entities?: Record<string, string>;
  rawTranscript: string;
  confidence: number;
}

export type VoiceIntent = 
  | 'navigate_to'
  | 'where_am_i'
  | 'repeat_instruction'
  | 'next_instruction'
  | 'stop_navigation'
  | 'find_nearest'
  | 'help'
  | 'emergency'
  | 'unknown';

// ====================
// AI Response Types
// ====================

export interface AIResponse {
  id: string;
  type: 'instruction' | 'warning' | 'information' | 'clarification';
  text: string;
  spokenText: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  interruptCurrent: boolean;
  metadata?: {
    confidence: number;
    reasoning?: string;
    sourceDetections?: string[];
  };
}

// ====================
// WebSocket Message Types
// ====================

export type WSMessageType = 
  | 'frame'
  | 'detection'
  | 'instruction'
  | 'position_update'
  | 'route_update'
  | 'voice_command'
  | 'ai_response'
  | 'error'
  | 'ping'
  | 'pong';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  timestamp: string;
  sessionId: string;
}
