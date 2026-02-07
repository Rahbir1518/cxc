import type { 
  IndoorMap, 
  MapNode, 
  MapEdge, 
  Route, 
  RouteNode, 
  RoutePreferences,
  Coordinates 
} from '@/types/navigation';
import { v4 as uuidv4 } from 'uuid';

/**
 * A* Pathfinding Algorithm for Indoor Navigation
 * 
 * Features:
 * - Shortest path calculation using A* with Euclidean heuristic
 * - Accessibility-aware routing (avoid stairs, prefer elevators)
 * - Respects temporary closures and alerts
 * - Returns detailed path with distance/time estimates
 */

// Walking speed in meters per second (average indoor pace)
const WALKING_SPEED_MPS = 1.2;

// Priority queue node for A*
interface AStarNode {
  nodeId: string;
  gScore: number;  // Cost from start to this node
  fScore: number;  // gScore + heuristic (estimated total cost)
  parent: string | null;
}

// Graph representation for faster lookups
interface GraphEdge {
  to: string;
  distance: number;
  accessible: boolean;
  edgeType: MapEdge['type'];
  isClosed: boolean;
}

type Graph = Map<string, GraphEdge[]>;

/**
 * Build adjacency list graph from map data
 */
function buildGraph(map: IndoorMap, preferences?: RoutePreferences): Graph {
  const graph: Graph = new Map();
  
  // Initialize all nodes
  for (const node of map.nodes) {
    graph.set(node.id, []);
  }
  
  // Get closed edges from alerts
  const closedEdges = new Set<string>();
  for (const alert of map.alerts ?? []) {
    for (const edgeId of alert.affectedEdges) {
      closedEdges.add(edgeId);
    }
  }
  
  // Add edges
  for (const edge of map.edges) {
    const isClosed = closedEdges.has(edge.id) || 
                     edge.metadata?.temporaryClosure === true ||
                     !edge.accessible;
    
    // Skip if avoiding stairs and this is a stair edge
    if (preferences?.avoidStairs && edge.type === 'stairs') {
      continue;
    }
    
    // Add forward edge
    const fromEdges = graph.get(edge.from);
    if (fromEdges) {
      fromEdges.push({
        to: edge.to,
        distance: edge.distance,
        accessible: edge.accessible,
        edgeType: edge.type,
        isClosed,
      });
    }
    
    // Add reverse edge if bidirectional
    if (edge.bidirectional) {
      const toEdges = graph.get(edge.to);
      if (toEdges) {
        toEdges.push({
          to: edge.from,
          distance: edge.distance,
          accessible: edge.accessible,
          edgeType: edge.type,
          isClosed,
        });
      }
    }
  }
  
  return graph;
}

/**
 * Euclidean distance heuristic for A*
 */
function heuristic(a: Coordinates, b: Coordinates): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = (b.floor - a.floor) * 4; // Floor changes add ~4m equivalent
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Find shortest path using A* algorithm
 */
export function findPath(
  map: IndoorMap,
  startNodeId: string,
  endNodeId: string,
  preferences?: RoutePreferences
): Route | null {
  const graph = buildGraph(map, preferences);
  const nodeMap = new Map<string, MapNode>();
  
  for (const node of map.nodes) {
    nodeMap.set(node.id, node);
  }
  
  const startNode = nodeMap.get(startNodeId);
  const endNode = nodeMap.get(endNodeId);
  
  if (!startNode || !endNode) {
    console.error('Start or end node not found');
    return null;
  }
  
  // A* algorithm
  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  
  // Initialize start node
  const startAStarNode: AStarNode = {
    nodeId: startNodeId,
    gScore: 0,
    fScore: heuristic(startNode.coordinates, endNode.coordinates),
    parent: null,
  };
  openSet.set(startNodeId, startAStarNode);
  
  const gScores = new Map<string, number>();
  gScores.set(startNodeId, 0);
  
  while (openSet.size > 0) {
    // Find node with lowest fScore
    let current: AStarNode | null = null;
    let lowestFScore = Infinity;
    
    for (const node of openSet.values()) {
      if (node.fScore < lowestFScore) {
        lowestFScore = node.fScore;
        current = node;
      }
    }
    
    if (!current) break;
    
    // Check if we've reached the goal
    if (current.nodeId === endNodeId) {
      // Reconstruct path
      const path: string[] = [];
      let currentId: string | undefined = endNodeId;
      
      while (currentId) {
        path.unshift(currentId);
        currentId = cameFrom.get(currentId);
      }
      
      return buildRoute(map, path, nodeMap);
    }
    
    // Move current from open to closed
    openSet.delete(current.nodeId);
    closedSet.add(current.nodeId);
    
    // Process neighbors
    const neighbors = graph.get(current.nodeId) ?? [];
    
    for (const neighbor of neighbors) {
      // Skip closed paths (unless it's the only option)
      if (neighbor.isClosed && !preferences?.avoidStairs) {
        continue;
      }
      
      if (closedSet.has(neighbor.to)) {
        continue;
      }
      
      const neighborNode = nodeMap.get(neighbor.to);
      if (!neighborNode) continue;
      
      // Calculate tentative gScore
      let edgeCost = neighbor.distance;
      
      // Prefer elevators over stairs if requested
      if (preferences?.preferElevators && neighbor.edgeType === 'elevator') {
        edgeCost *= 0.8; // 20% bonus for elevators
      }
      
      const tentativeGScore = (gScores.get(current.nodeId) ?? Infinity) + edgeCost;
      
      if (tentativeGScore < (gScores.get(neighbor.to) ?? Infinity)) {
        // This is a better path
        cameFrom.set(neighbor.to, current.nodeId);
        gScores.set(neighbor.to, tentativeGScore);
        
        const fScore = tentativeGScore + heuristic(neighborNode.coordinates, endNode.coordinates);
        
        openSet.set(neighbor.to, {
          nodeId: neighbor.to,
          gScore: tentativeGScore,
          fScore,
          parent: current.nodeId,
        });
      }
    }
  }
  
  // No path found
  console.error('No path found from', startNodeId, 'to', endNodeId);
  return null;
}

/**
 * Build a Route object from the path
 */
function buildRoute(
  map: IndoorMap,
  pathNodeIds: string[],
  nodeMap: Map<string, MapNode>
): Route {
  const routeNodes: RouteNode[] = [];
  let totalDistance = 0;
  
  // Build edge lookup
  const edgeMap = new Map<string, MapEdge>();
  for (const edge of map.edges) {
    edgeMap.set(`${edge.from}-${edge.to}`, edge);
    if (edge.bidirectional) {
      edgeMap.set(`${edge.to}-${edge.from}`, edge);
    }
  }
  
  for (let i = 0; i < pathNodeIds.length; i++) {
    const nodeId = pathNodeIds[i];
    const node = nodeMap.get(nodeId);
    
    if (!node) continue;
    
    // Calculate distance from previous node
    if (i > 0) {
      const prevNodeId = pathNodeIds[i - 1];
      const edge = edgeMap.get(`${prevNodeId}-${nodeId}`);
      if (edge) {
        totalDistance += edge.distance;
      }
    }
    
    routeNodes.push({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      coordinates: node.coordinates,
      distanceFromStart: totalDistance,
      estimatedTimeFromStart: Math.round(totalDistance / WALKING_SPEED_MPS),
    });
  }
  
  return {
    id: uuidv4(),
    startNode: pathNodeIds[0],
    endNode: pathNodeIds[pathNodeIds.length - 1],
    totalDistance,
    estimatedTime: Math.round(totalDistance / WALKING_SPEED_MPS),
    path: routeNodes,
    instructions: [], // Will be generated by instruction generator
    createdAt: new Date().toISOString(),
  };
}

/**
 * Find route to nearest node of a specific type
 */
export function findRouteToNearest(
  map: IndoorMap,
  startNodeId: string,
  targetType: MapNode['type'],
  preferences?: RoutePreferences
): Route | null {
  const targetNodes = map.nodes.filter(n => n.type === targetType);
  
  if (targetNodes.length === 0) {
    return null;
  }
  
  let bestRoute: Route | null = null;
  let shortestDistance = Infinity;
  
  for (const target of targetNodes) {
    const route = findPath(map, startNodeId, target.id, preferences);
    if (route && route.totalDistance < shortestDistance) {
      shortestDistance = route.totalDistance;
      bestRoute = route;
    }
  }
  
  return bestRoute;
}

/**
 * Validate if a route is still valid (no closures along the path)
 */
export function validateRoute(map: IndoorMap, route: Route): boolean {
  const closedEdges = new Set<string>();
  const closedNodes = new Set<string>();
  
  for (const alert of map.alerts ?? []) {
    for (const edgeId of alert.affectedEdges) {
      closedEdges.add(edgeId);
    }
    for (const nodeId of alert.affectedNodes) {
      closedNodes.add(nodeId);
    }
  }
  
  // Check if any node in the path is closed
  for (const node of route.path) {
    if (closedNodes.has(node.nodeId)) {
      return false;
    }
  }
  
  // Build edge lookup
  const edgeIdMap = new Map<string, string>();
  for (const edge of map.edges) {
    edgeIdMap.set(`${edge.from}-${edge.to}`, edge.id);
    if (edge.bidirectional) {
      edgeIdMap.set(`${edge.to}-${edge.from}`, edge.id);
    }
  }
  
  // Check if any edge in the path is closed
  for (let i = 0; i < route.path.length - 1; i++) {
    const fromId = route.path[i].nodeId;
    const toId = route.path[i + 1].nodeId;
    const edgeId = edgeIdMap.get(`${fromId}-${toId}`);
    
    if (edgeId && closedEdges.has(edgeId)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get alternative routes (for when primary route fails)
 */
export function findAlternativeRoutes(
  map: IndoorMap,
  startNodeId: string,
  endNodeId: string,
  count: number = 3
): Route[] {
  const routes: Route[] = [];
  
  // Try different preference combinations
  const preferenceVariants: RoutePreferences[] = [
    { avoidStairs: false, preferElevators: false, avoidCrowdedAreas: false },
    { avoidStairs: true, preferElevators: true, avoidCrowdedAreas: false },
    { avoidStairs: false, preferElevators: true, avoidCrowdedAreas: true },
  ];
  
  const seenPaths = new Set<string>();
  
  for (const prefs of preferenceVariants) {
    if (routes.length >= count) break;
    
    const route = findPath(map, startNodeId, endNodeId, prefs);
    if (route) {
      const pathKey = route.path.map(n => n.nodeId).join('-');
      if (!seenPaths.has(pathKey)) {
        seenPaths.add(pathKey);
        routes.push(route);
      }
    }
  }
  
  return routes;
}

export default {
  findPath,
  findRouteToNearest,
  validateRoute,
  findAlternativeRoutes,
};
