import type { IndoorMap, MapNode, MapEdge, MapAlert } from '@/types/navigation';

/**
 * Science Teaching Complex - Basement Floor Plan
 * Building No. 54, University of Waterloo
 * Updated: June 2016
 * 
 * Coordinate System:
 * - Origin (0,0) is at the southwest corner
 * - X increases going east
 * - Y increases going north
 * - Scale: 1 unit = 1 meter
 */

// ============================================
// Map Nodes - Rooms, Doors, Intersections
// ============================================

const nodes: MapNode[] = [
  // ==================
  // Main Corridor Intersections (North side)
  // ==================
  {
    id: 'int-main-west',
    name: 'Main Corridor West',
    type: 'intersection',
    coordinates: { x: 10, y: 55, floor: 0 },
    accessible: true,
    connections: ['door-0806', 'int-main-center-west', 'exit-west'],
    metadata: {
      landmarks: ['Near room 0806', 'West end of main corridor'],
    },
  },
  {
    id: 'int-main-center-west',
    name: 'Main Corridor Center-West',
    type: 'intersection',
    coordinates: { x: 25, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-main-west', 'door-0802a', 'door-0802', 'int-main-center'],
    metadata: {
      landmarks: ['Between rooms 0802A and 0802'],
    },
  },
  {
    id: 'int-main-center',
    name: 'Main Corridor Center',
    type: 'intersection',
    coordinates: { x: 40, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-main-center-west', 'door-0802b', 'int-main-center-east', 'int-south-corridor-north'],
    metadata: {
      landmarks: ['Central intersection', 'Near room 0802B'],
    },
  },
  {
    id: 'int-main-center-east',
    name: 'Main Corridor Center-East',
    type: 'intersection',
    coordinates: { x: 55, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-main-center', 'door-0807', 'door-0801', 'int-main-east'],
    metadata: {
      landmarks: ['Near rooms 0807 and 0801'],
    },
  },
  {
    id: 'int-main-east',
    name: 'Main Corridor East',
    type: 'intersection',
    coordinates: { x: 75, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-main-center-east', 'door-0810', 'int-east-corridor-north'],
    metadata: {
      landmarks: ['Near room 0810', 'Junction to east wing'],
    },
  },

  // ==================
  // East Wing Corridor
  // ==================
  {
    id: 'int-east-corridor-north',
    name: 'East Corridor North',
    type: 'intersection',
    coordinates: { x: 90, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-main-east', 'door-0811', 'door-0813', 'int-east-corridor-center'],
    metadata: {
      landmarks: ['Near room 0811', 'Biology 2 entrance'],
    },
  },
  {
    id: 'int-east-corridor-center',
    name: 'East Corridor Center',
    type: 'intersection',
    coordinates: { x: 90, y: 40, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-north', 'door-0814', 'door-0860', 'int-east-corridor-south', 'elv-east'],
    metadata: {
      landmarks: ['Near elevator', 'Biology 1 area'],
    },
  },
  {
    id: 'int-east-corridor-south',
    name: 'East Corridor South',
    type: 'intersection',
    coordinates: { x: 90, y: 25, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-center', 'door-0815', 'door-0816', 'door-0850', 'int-south-corridor-east'],
    metadata: {
      landmarks: ['Near rooms 0815 and 0816'],
    },
  },

  // ==================
  // South Corridor
  // ==================
  {
    id: 'int-south-corridor-east',
    name: 'South Corridor East',
    type: 'intersection',
    coordinates: { x: 80, y: 10, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-south', 'door-0845', 'door-0846', 'int-south-corridor-center'],
    metadata: {
      landmarks: ['Near lecture hall 0845'],
    },
  },
  {
    id: 'int-south-corridor-center',
    name: 'South Corridor Center',
    type: 'intersection',
    coordinates: { x: 55, y: 10, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-east', 'door-0844', 'door-0803', 'int-south-corridor-west'],
    metadata: {
      landmarks: ['Central south area', 'Near room 0803'],
    },
  },
  {
    id: 'int-south-corridor-west',
    name: 'South Corridor West',
    type: 'intersection',
    coordinates: { x: 30, y: 10, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-center', 'door-0840', 'int-south-corridor-north'],
    metadata: {
      landmarks: ['Southwest lecture hall area'],
    },
  },
  {
    id: 'int-south-corridor-north',
    name: 'Central Corridor South',
    type: 'intersection',
    coordinates: { x: 40, y: 30, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-west', 'int-main-center', 'door-0832', 'door-0834', 'door-0836'],
    metadata: {
      landmarks: ['Between main lecture halls'],
    },
  },

  // ==================
  // Doors to Rooms
  // ==================
  {
    id: 'door-0806',
    name: 'Door to Room 0806',
    type: 'door',
    coordinates: { x: 8, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-west', 'room-0806'],
    metadata: { roomNumber: '0806', doorWidth: 0.9 },
  },
  {
    id: 'door-0802a',
    name: 'Door to Room 0802A',
    type: 'door',
    coordinates: { x: 22, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-center-west', 'room-0802a'],
    metadata: { roomNumber: '0802A', doorWidth: 0.9 },
  },
  {
    id: 'door-0802',
    name: 'Door to Room 0802',
    type: 'door',
    coordinates: { x: 28, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-center-west', 'room-0802'],
    metadata: { roomNumber: '0802', doorWidth: 1.2 },
  },
  {
    id: 'door-0802b',
    name: 'Door to Room 0802B',
    type: 'door',
    coordinates: { x: 38, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-center', 'room-0802b'],
    metadata: { roomNumber: '0802B', doorWidth: 0.9 },
  },
  {
    id: 'door-0807',
    name: 'Door to Room 0807',
    type: 'door',
    coordinates: { x: 52, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-center-east', 'room-0807'],
    metadata: { roomNumber: '0807', doorWidth: 0.9 },
  },
  {
    id: 'door-0801',
    name: 'Door to Room 0801',
    type: 'door',
    coordinates: { x: 60, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-center-east', 'room-0801'],
    metadata: { roomNumber: '0801', doorWidth: 1.2 },
  },
  {
    id: 'door-0810',
    name: 'Door to Room 0810',
    type: 'door',
    coordinates: { x: 72, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-main-east', 'room-0810'],
    metadata: { roomNumber: '0810', doorWidth: 0.9 },
  },
  {
    id: 'door-0811',
    name: 'Door to Room 0811',
    type: 'door',
    coordinates: { x: 95, y: 58, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-north', 'room-0811'],
    metadata: { roomNumber: '0811', doorWidth: 0.9 },
  },
  {
    id: 'door-0813',
    name: 'Door to Room 0813',
    type: 'door',
    coordinates: { x: 100, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-north', 'room-0813'],
    metadata: { roomNumber: '0813', doorWidth: 0.9 },
  },
  {
    id: 'door-0814',
    name: 'Door to Room 0814',
    type: 'door',
    coordinates: { x: 95, y: 43, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-center', 'room-0814'],
    metadata: { roomNumber: '0814', doorWidth: 0.9 },
  },
  {
    id: 'door-0815',
    name: 'Door to Room 0815',
    type: 'door',
    coordinates: { x: 95, y: 28, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-south', 'room-0815'],
    metadata: { roomNumber: '0815', doorWidth: 1.2, landmarks: ['Main entrance to Biology 1'] },
  },
  {
    id: 'door-0816',
    name: 'Door to Room 0816',
    type: 'door',
    coordinates: { x: 100, y: 25, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-south', 'room-0816'],
    metadata: { roomNumber: '0816', doorWidth: 0.9 },
  },
  {
    id: 'door-0860',
    name: 'Door to Room 0860',
    type: 'door',
    coordinates: { x: 85, y: 40, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-center', 'room-0860'],
    metadata: { roomNumber: '0860', doorWidth: 0.9 },
  },
  {
    id: 'door-0850',
    name: 'Door to Room 0850',
    type: 'door',
    coordinates: { x: 85, y: 28, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-south', 'room-0850'],
    metadata: { roomNumber: '0850', doorWidth: 0.9 },
  },
  {
    id: 'door-0845',
    name: 'Door to Lecture Hall 0845',
    type: 'door',
    coordinates: { x: 82, y: 12, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-east', 'room-0845'],
    metadata: { roomNumber: '0845', doorWidth: 1.5, description: 'Large lecture hall entrance' },
  },
  {
    id: 'door-0846',
    name: 'Door to Room 0846',
    type: 'door',
    coordinates: { x: 78, y: 8, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-east', 'room-0846'],
    metadata: { roomNumber: '0846', doorWidth: 0.9 },
  },
  {
    id: 'door-0844',
    name: 'Door to Lecture Hall 0844',
    type: 'door',
    coordinates: { x: 58, y: 15, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-center', 'room-0844'],
    metadata: { roomNumber: '0844', doorWidth: 1.5, description: 'Lecture hall entrance' },
  },
  {
    id: 'door-0803',
    name: 'Door to Room 0803',
    type: 'door',
    coordinates: { x: 52, y: 8, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-center', 'room-0803'],
    metadata: { roomNumber: '0803', doorWidth: 0.9 },
  },
  {
    id: 'door-0840',
    name: 'Door to Lecture Hall 0840',
    type: 'door',
    coordinates: { x: 32, y: 15, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-west', 'room-0840'],
    metadata: { roomNumber: '0840', doorWidth: 1.5, description: 'Lecture hall entrance' },
  },
  {
    id: 'door-0832',
    name: 'Door to Room 0832',
    type: 'door',
    coordinates: { x: 35, y: 32, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-north', 'room-0832'],
    metadata: { roomNumber: '0832', doorWidth: 0.9 },
  },
  {
    id: 'door-0834',
    name: 'Door to Room 0834',
    type: 'door',
    coordinates: { x: 42, y: 35, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-north', 'room-0834'],
    metadata: { roomNumber: '0834', doorWidth: 0.9 },
  },
  {
    id: 'door-0836',
    name: 'Door to Room 0836',
    type: 'door',
    coordinates: { x: 45, y: 32, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-north', 'room-0836'],
    metadata: { roomNumber: '0836', doorWidth: 0.9 },
  },

  // ==================
  // Rooms
  // ==================
  {
    id: 'room-0806',
    name: 'Room 0806',
    type: 'room',
    coordinates: { x: 5, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0806'],
    metadata: { roomNumber: '0806' },
  },
  {
    id: 'room-0802a',
    name: 'Room 0802A',
    type: 'room',
    coordinates: { x: 20, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0802a'],
    metadata: { roomNumber: '0802A' },
  },
  {
    id: 'room-0802',
    name: 'Room 0802',
    type: 'room',
    coordinates: { x: 28, y: 65, floor: 0 },
    accessible: true,
    connections: ['door-0802'],
    metadata: { roomNumber: '0802', description: 'Larger lab/classroom' },
  },
  {
    id: 'room-0802b',
    name: 'Room 0802B',
    type: 'room',
    coordinates: { x: 38, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0802b'],
    metadata: { roomNumber: '0802B' },
  },
  {
    id: 'room-0807',
    name: 'Room 0807',
    type: 'room',
    coordinates: { x: 52, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0807'],
    metadata: { roomNumber: '0807' },
  },
  {
    id: 'room-0801',
    name: 'Room 0801',
    type: 'room',
    coordinates: { x: 62, y: 65, floor: 0 },
    accessible: true,
    connections: ['door-0801'],
    metadata: { roomNumber: '0801', description: 'Large classroom' },
  },
  {
    id: 'room-0810',
    name: 'Room 0810',
    type: 'room',
    coordinates: { x: 72, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0810'],
    metadata: { roomNumber: '0810' },
  },
  {
    id: 'room-0811',
    name: 'Room 0811',
    type: 'room',
    coordinates: { x: 98, y: 62, floor: 0 },
    accessible: true,
    connections: ['door-0811'],
    metadata: { roomNumber: '0811' },
  },
  {
    id: 'room-0813',
    name: 'Room 0813',
    type: 'room',
    coordinates: { x: 105, y: 55, floor: 0 },
    accessible: true,
    connections: ['door-0813'],
    metadata: { roomNumber: '0813' },
  },
  {
    id: 'room-0814',
    name: 'Room 0814',
    type: 'room',
    coordinates: { x: 100, y: 43, floor: 0 },
    accessible: true,
    connections: ['door-0814'],
    metadata: { roomNumber: '0814' },
  },
  {
    id: 'room-0815',
    name: 'Biology 1 Lecture Hall',
    type: 'room',
    coordinates: { x: 100, y: 32, floor: 0 },
    accessible: true,
    connections: ['door-0815'],
    metadata: { 
      roomNumber: '0815', 
      description: 'Biology 1 - Large lecture hall',
      landmarks: ['Main Biology lecture hall']
    },
  },
  {
    id: 'room-0816',
    name: 'Room 0816',
    type: 'room',
    coordinates: { x: 105, y: 22, floor: 0 },
    accessible: true,
    connections: ['door-0816'],
    metadata: { roomNumber: '0816' },
  },
  {
    id: 'room-0860',
    name: 'Room 0860',
    type: 'room',
    coordinates: { x: 80, y: 40, floor: 0 },
    accessible: true,
    connections: ['door-0860'],
    metadata: { roomNumber: '0860' },
  },
  {
    id: 'room-0850',
    name: 'Room 0850',
    type: 'room',
    coordinates: { x: 80, y: 28, floor: 0 },
    accessible: true,
    connections: ['door-0850'],
    metadata: { roomNumber: '0850' },
  },
  {
    id: 'room-0845',
    name: 'Lecture Hall 0845',
    type: 'room',
    coordinates: { x: 75, y: 18, floor: 0 },
    accessible: true,
    connections: ['door-0845'],
    metadata: { roomNumber: '0845', description: 'Large lecture hall with tiered seating' },
  },
  {
    id: 'room-0846',
    name: 'Room 0846',
    type: 'room',
    coordinates: { x: 75, y: 5, floor: 0 },
    accessible: true,
    connections: ['door-0846'],
    metadata: { roomNumber: '0846' },
  },
  {
    id: 'room-0844',
    name: 'Lecture Hall 0844',
    type: 'room',
    coordinates: { x: 55, y: 25, floor: 0 },
    accessible: true,
    connections: ['door-0844'],
    metadata: { roomNumber: '0844', description: 'Large lecture hall with tiered seating' },
  },
  {
    id: 'room-0803',
    name: 'Room 0803',
    type: 'room',
    coordinates: { x: 50, y: 5, floor: 0 },
    accessible: true,
    connections: ['door-0803'],
    metadata: { roomNumber: '0803' },
  },
  {
    id: 'room-0840',
    name: 'Lecture Hall 0840',
    type: 'room',
    coordinates: { x: 30, y: 25, floor: 0 },
    accessible: true,
    connections: ['door-0840'],
    metadata: { roomNumber: '0840', description: 'Large lecture hall with tiered seating' },
  },
  {
    id: 'room-0832',
    name: 'Room 0832',
    type: 'room',
    coordinates: { x: 32, y: 35, floor: 0 },
    accessible: true,
    connections: ['door-0832'],
    metadata: { roomNumber: '0832' },
  },
  {
    id: 'room-0834',
    name: 'Room 0834',
    type: 'room',
    coordinates: { x: 42, y: 38, floor: 0 },
    accessible: true,
    connections: ['door-0834'],
    metadata: { roomNumber: '0834' },
  },
  {
    id: 'room-0836',
    name: 'Room 0836',
    type: 'room',
    coordinates: { x: 48, y: 35, floor: 0 },
    accessible: true,
    connections: ['door-0836'],
    metadata: { roomNumber: '0836' },
  },

  // ==================
  // Elevators & Stairs
  // ==================
  {
    id: 'elv-east',
    name: 'East Elevator',
    type: 'elevator',
    coordinates: { x: 93, y: 40, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-center'],
    metadata: {
      description: 'Elevator to all floors',
      landmarks: ['Near Biology 1'],
    },
  },

  // ==================
  // Exits
  // ==================
  {
    id: 'exit-west',
    name: 'West Exit',
    type: 'exit',
    coordinates: { x: 5, y: 55, floor: 0 },
    accessible: false,  // Marked as closed in floor plan
    connections: ['int-main-west'],
    metadata: {
      description: 'Exit currently closed - use alternate exit',
      landmarks: ['Near room 0806'],
    },
  },
  {
    id: 'exit-east',
    name: 'East Exit',
    type: 'exit',
    coordinates: { x: 105, y: 55, floor: 0 },
    accessible: true,
    connections: ['int-east-corridor-north'],
    metadata: {
      description: 'Main east exit',
      landmarks: ['Near Biology 2'],
    },
  },

  // ==================
  // Restrooms
  // ==================
  {
    id: 'restroom-m-south',
    name: "Men's Restroom",
    type: 'restroom',
    coordinates: { x: 70, y: 8, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-east'],
    metadata: {
      description: "Men's Washroom",
    },
  },
  {
    id: 'restroom-w-south',
    name: "Women's Restroom",
    type: 'restroom',
    coordinates: { x: 72, y: 8, floor: 0 },
    accessible: true,
    connections: ['int-south-corridor-east'],
    metadata: {
      description: "Women's Washroom",
    },
  },
];

// ============================================
// Map Edges - Connections between nodes
// ============================================

const edges: MapEdge[] = [
  // Main Corridor (West to East)
  {
    id: 'edge-main-1',
    from: 'int-main-west',
    to: 'int-main-center-west',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },
  {
    id: 'edge-main-2',
    from: 'int-main-center-west',
    to: 'int-main-center',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },
  {
    id: 'edge-main-3',
    from: 'int-main-center',
    to: 'int-main-center-east',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },
  {
    id: 'edge-main-4',
    from: 'int-main-center-east',
    to: 'int-main-east',
    distance: 20,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },
  {
    id: 'edge-main-5',
    from: 'int-main-east',
    to: 'int-east-corridor-north',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },

  // East Corridor (North to South)
  {
    id: 'edge-east-1',
    from: 'int-east-corridor-north',
    to: 'int-east-corridor-center',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.0 },
  },
  {
    id: 'edge-east-2',
    from: 'int-east-corridor-center',
    to: 'int-east-corridor-south',
    distance: 15,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.0 },
  },
  {
    id: 'edge-east-3',
    from: 'int-east-corridor-south',
    to: 'int-south-corridor-east',
    distance: 18,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.0 },
  },

  // South Corridor (East to West)
  {
    id: 'edge-south-1',
    from: 'int-south-corridor-east',
    to: 'int-south-corridor-center',
    distance: 25,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },
  {
    id: 'edge-south-2',
    from: 'int-south-corridor-center',
    to: 'int-south-corridor-west',
    distance: 25,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.5 },
  },

  // Central connector
  {
    id: 'edge-central-1',
    from: 'int-main-center',
    to: 'int-south-corridor-north',
    distance: 25,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.0 },
  },
  {
    id: 'edge-central-2',
    from: 'int-south-corridor-north',
    to: 'int-south-corridor-west',
    distance: 22,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
    metadata: { width: 2.0 },
  },

  // Door connections (all doors to their rooms)
  {
    id: 'edge-door-0806',
    from: 'door-0806',
    to: 'room-0806',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0802a',
    from: 'door-0802a',
    to: 'room-0802a',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0802',
    from: 'door-0802',
    to: 'room-0802',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0802b',
    from: 'door-0802b',
    to: 'room-0802b',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0807',
    from: 'door-0807',
    to: 'room-0807',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0801',
    from: 'door-0801',
    to: 'room-0801',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0810',
    from: 'door-0810',
    to: 'room-0810',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0811',
    from: 'door-0811',
    to: 'room-0811',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0813',
    from: 'door-0813',
    to: 'room-0813',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0814',
    from: 'door-0814',
    to: 'room-0814',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0815',
    from: 'door-0815',
    to: 'room-0815',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0816',
    from: 'door-0816',
    to: 'room-0816',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0860',
    from: 'door-0860',
    to: 'room-0860',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0850',
    from: 'door-0850',
    to: 'room-0850',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0845',
    from: 'door-0845',
    to: 'room-0845',
    distance: 3,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0846',
    from: 'door-0846',
    to: 'room-0846',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0844',
    from: 'door-0844',
    to: 'room-0844',
    distance: 3,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0803',
    from: 'door-0803',
    to: 'room-0803',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0840',
    from: 'door-0840',
    to: 'room-0840',
    distance: 3,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0832',
    from: 'door-0832',
    to: 'room-0832',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0834',
    from: 'door-0834',
    to: 'room-0834',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-door-0836',
    from: 'door-0836',
    to: 'room-0836',
    distance: 2,
    type: 'doorway',
    accessible: true,
    bidirectional: true,
  },

  // Corridor to door connections
  {
    id: 'edge-int-door-0806',
    from: 'int-main-west',
    to: 'door-0806',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0802a',
    from: 'int-main-center-west',
    to: 'door-0802a',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0802',
    from: 'int-main-center-west',
    to: 'door-0802',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0802b',
    from: 'int-main-center',
    to: 'door-0802b',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0807',
    from: 'int-main-center-east',
    to: 'door-0807',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0801',
    from: 'int-main-center-east',
    to: 'door-0801',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0810',
    from: 'int-main-east',
    to: 'door-0810',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0811',
    from: 'int-east-corridor-north',
    to: 'door-0811',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0813',
    from: 'int-east-corridor-north',
    to: 'door-0813',
    distance: 5,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0814',
    from: 'int-east-corridor-center',
    to: 'door-0814',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0815',
    from: 'int-east-corridor-south',
    to: 'door-0815',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0816',
    from: 'int-east-corridor-south',
    to: 'door-0816',
    distance: 5,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0860',
    from: 'int-east-corridor-center',
    to: 'door-0860',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0850',
    from: 'int-east-corridor-south',
    to: 'door-0850',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0845',
    from: 'int-south-corridor-east',
    to: 'door-0845',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0846',
    from: 'int-south-corridor-east',
    to: 'door-0846',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0844',
    from: 'int-south-corridor-center',
    to: 'door-0844',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0803',
    from: 'int-south-corridor-center',
    to: 'door-0803',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0840',
    from: 'int-south-corridor-west',
    to: 'door-0840',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0832',
    from: 'int-south-corridor-north',
    to: 'door-0832',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0834',
    from: 'int-south-corridor-north',
    to: 'door-0834',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-int-door-0836',
    from: 'int-south-corridor-north',
    to: 'door-0836',
    distance: 3,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },

  // Elevator connections
  {
    id: 'edge-elv-east',
    from: 'int-east-corridor-center',
    to: 'elv-east',
    distance: 3,
    type: 'elevator',
    accessible: true,
    bidirectional: true,
  },

  // Exit connections
  {
    id: 'edge-exit-west',
    from: 'int-main-west',
    to: 'exit-west',
    distance: 5,
    type: 'hallway',
    accessible: false,  // Currently closed
    bidirectional: true,
    metadata: {
      temporaryClosure: true,
      closureReason: 'Exit is closed - please use alternate exit',
    },
  },
  {
    id: 'edge-exit-east',
    from: 'int-east-corridor-north',
    to: 'exit-east',
    distance: 5,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },

  // Restroom connections
  {
    id: 'edge-restroom-m',
    from: 'int-south-corridor-east',
    to: 'restroom-m-south',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
  {
    id: 'edge-restroom-w',
    from: 'int-south-corridor-east',
    to: 'restroom-w-south',
    distance: 4,
    type: 'hallway',
    accessible: true,
    bidirectional: true,
  },
];

// ============================================
// Active Alerts
// ============================================

const alerts: MapAlert[] = [
  {
    id: 'alert-west-exit',
    type: 'closure',
    affectedNodes: ['exit-west'],
    affectedEdges: ['edge-exit-west'],
    message: 'West exit is closed. Please use the east exit near Biology 2.',
    severity: 'high',
  },
];

// ============================================
// Complete Map Export
// ============================================

export const scienceTeachingComplexBasement: IndoorMap = {
  id: 'stc-basement',
  buildingName: 'Science Teaching Complex',
  buildingNumber: '54',
  floor: 0,
  floorName: 'Basement',
  lastUpdated: '2016-06-01',
  origin: {
    latitude: 43.4723,  // University of Waterloo approximate coordinates
    longitude: -80.5449,
  },
  bounds: {
    width: 110,  // meters
    height: 70,  // meters
  },
  nodes,
  edges,
  alerts,
};

// Helper function to get map by ID
export function getMapById(mapId: string): IndoorMap | undefined {
  const maps: Record<string, IndoorMap> = {
    'stc-basement': scienceTeachingComplexBasement,
  };
  return maps[mapId];
}

// Helper function to get all available maps
export function getAvailableMaps(): Array<{ id: string; name: string; floor: string }> {
  return [
    { 
      id: 'stc-basement', 
      name: 'Science Teaching Complex', 
      floor: 'Basement' 
    },
  ];
}

// Helper to find node by room number
export function findNodeByRoomNumber(map: IndoorMap, roomNumber: string): MapNode | undefined {
  return map.nodes.find(
    node => node.metadata?.roomNumber?.toLowerCase() === roomNumber.toLowerCase()
  );
}

// Helper to find nearest node by type
export function findNearestByType(
  map: IndoorMap, 
  fromNodeId: string, 
  nodeType: MapNode['type']
): MapNode | undefined {
  const fromNode = map.nodes.find(n => n.id === fromNodeId);
  if (!fromNode) return undefined;

  const targetNodes = map.nodes.filter(n => n.type === nodeType);
  if (targetNodes.length === 0) return undefined;

  // Simple distance calculation (Euclidean)
  let nearest: MapNode | undefined;
  let minDistance = Infinity;

  for (const target of targetNodes) {
    const dx = target.coordinates.x - fromNode.coordinates.x;
    const dy = target.coordinates.y - fromNode.coordinates.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearest = target;
    }
  }

  return nearest;
}

export default scienceTeachingComplexBasement;
