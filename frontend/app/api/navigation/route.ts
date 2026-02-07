import { NextRequest, NextResponse } from 'next/server';
import {
  findPath,
  findRouteToNearest,
  validateRoute,
  findAlternativeRoutes,
  generateInstructions,
  addHazardWarnings,
  generateRouteSummary,
  getMapById,
  getAvailableMaps,
  findNodeByRoomNumber,
} from '@/lib/navigation';
import type { RoutePreferences } from '@/types/navigation';

/**
 * Navigation API Endpoints
 * 
 * GET /api/navigation - Get available maps
 * POST /api/navigation - Calculate route and generate instructions
 * POST /api/navigation?action=validate - Validate an existing route
 * POST /api/navigation?action=nearest - Find route to nearest amenity
 */

// GET: List available maps and their metadata
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mapId = searchParams.get('mapId');
    
    if (mapId) {
      // Return specific map details
      const map = getMapById(mapId);
      if (!map) {
        return NextResponse.json(
          { error: 'Map not found', mapId },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        id: map.id,
        buildingName: map.buildingName,
        buildingNumber: map.buildingNumber,
        floor: map.floor,
        floorName: map.floorName,
        bounds: map.bounds,
        nodeCount: map.nodes.length,
        alerts: map.alerts,
        rooms: map.nodes
          .filter(n => n.type === 'room')
          .map(n => ({
            id: n.id,
            name: n.name,
            roomNumber: n.metadata?.roomNumber,
          })),
      });
    }
    
    // Return list of all available maps
    const maps = getAvailableMaps();
    return NextResponse.json({ maps });
  } catch (error) {
    console.error('Navigation GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve map data' },
      { status: 500 }
    );
  }
}

// POST: Calculate route or perform navigation actions
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const body = await request.json();
    
    // Handle different actions
    switch (action) {
      case 'validate':
        return handleValidateRoute(body);
      case 'nearest':
        return handleFindNearest(body);
      case 'alternatives':
        return handleFindAlternatives(body);
      default:
        return handleCalculateRoute(body);
    }
  } catch (error) {
    console.error('Navigation POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process navigation request' },
      { status: 500 }
    );
  }
}

/**
 * Calculate a route between two points
 */
async function handleCalculateRoute(body: {
  mapId: string;
  startNodeId?: string;
  endNodeId?: string;
  startRoom?: string;
  endRoom?: string;
  preferences?: RoutePreferences;
}) {
  const { mapId, startNodeId, endNodeId, startRoom, endRoom, preferences } = body;
  
  const map = getMapById(mapId);
  if (!map) {
    return NextResponse.json(
      { error: 'Map not found', mapId },
      { status: 404 }
    );
  }
  
  // Resolve room numbers to node IDs if provided
  let resolvedStartId = startNodeId;
  let resolvedEndId = endNodeId;
  
  if (startRoom && !resolvedStartId) {
    const startNode = findNodeByRoomNumber(map, startRoom);
    if (!startNode) {
      return NextResponse.json(
        { error: 'Start room not found', room: startRoom },
        { status: 404 }
      );
    }
    resolvedStartId = startNode.id;
  }
  
  if (endRoom && !resolvedEndId) {
    const endNode = findNodeByRoomNumber(map, endRoom);
    if (!endNode) {
      return NextResponse.json(
        { error: 'End room not found', room: endRoom },
        { status: 404 }
      );
    }
    resolvedEndId = endNode.id;
  }
  
  if (!resolvedStartId || !resolvedEndId) {
    return NextResponse.json(
      { error: 'Start and end locations are required' },
      { status: 400 }
    );
  }
  
  // Calculate route
  const route = findPath(map, resolvedStartId, resolvedEndId, preferences);
  
  if (!route) {
    return NextResponse.json(
      { 
        error: 'No route found',
        suggestion: 'Try different start/end points or check for closures',
      },
      { status: 404 }
    );
  }
  
  // Generate instructions
  let instructions = generateInstructions(route, map);
  instructions = addHazardWarnings(instructions, map, route.path);
  route.instructions = instructions;
  
  // Generate summary
  const summary = generateRouteSummary(route, map);
  
  return NextResponse.json({
    success: true,
    route,
    summary,
    spokenSummary: summary,
  });
}

/**
 * Validate if an existing route is still valid
 */
async function handleValidateRoute(body: {
  mapId: string;
  route: { path: { nodeId: string }[] };
}) {
  const { mapId, route } = body;
  
  const map = getMapById(mapId);
  if (!map) {
    return NextResponse.json(
      { error: 'Map not found' },
      { status: 404 }
    );
  }
  
  const isValid = validateRoute(map, route as never);
  
  return NextResponse.json({
    valid: isValid,
    message: isValid 
      ? 'Route is still valid' 
      : 'Route has been affected by closures. Please recalculate.',
  });
}

/**
 * Find route to nearest amenity (restroom, elevator, exit, etc.)
 */
async function handleFindNearest(body: {
  mapId: string;
  currentNodeId?: string;
  currentRoom?: string;
  targetType: 'restroom' | 'elevator' | 'exit' | 'stairs';
  preferences?: RoutePreferences;
}) {
  const { mapId, currentNodeId, currentRoom, targetType, preferences } = body;
  
  const map = getMapById(mapId);
  if (!map) {
    return NextResponse.json(
      { error: 'Map not found' },
      { status: 404 }
    );
  }
  
  // Resolve current location
  let resolvedCurrentId = currentNodeId;
  if (currentRoom && !resolvedCurrentId) {
    const currentNode = findNodeByRoomNumber(map, currentRoom);
    if (currentNode) {
      resolvedCurrentId = currentNode.id;
    }
  }
  
  if (!resolvedCurrentId) {
    return NextResponse.json(
      { error: 'Current location is required' },
      { status: 400 }
    );
  }
  
  const route = findRouteToNearest(map, resolvedCurrentId, targetType, preferences);
  
  if (!route) {
    return NextResponse.json(
      { error: `No ${targetType} found nearby` },
      { status: 404 }
    );
  }
  
  // Generate instructions
  let instructions = generateInstructions(route, map);
  instructions = addHazardWarnings(instructions, map, route.path);
  route.instructions = instructions;
  
  const targetNode = map.nodes.find(n => n.id === route.endNode);
  
  return NextResponse.json({
    success: true,
    route,
    targetType,
    targetName: targetNode?.name,
    summary: generateRouteSummary(route, map),
  });
}

/**
 * Find alternative routes
 */
async function handleFindAlternatives(body: {
  mapId: string;
  startNodeId: string;
  endNodeId: string;
  count?: number;
}) {
  const { mapId, startNodeId, endNodeId, count = 3 } = body;
  
  const map = getMapById(mapId);
  if (!map) {
    return NextResponse.json(
      { error: 'Map not found' },
      { status: 404 }
    );
  }
  
  const routes = findAlternativeRoutes(map, startNodeId, endNodeId, count);
  
  // Generate instructions for each route
  const routesWithInstructions = routes.map(route => {
    let instructions = generateInstructions(route, map);
    instructions = addHazardWarnings(instructions, map, route.path);
    route.instructions = instructions;
    return {
      route,
      summary: generateRouteSummary(route, map),
    };
  });
  
  return NextResponse.json({
    success: true,
    alternatives: routesWithInstructions,
    count: routesWithInstructions.length,
  });
}
