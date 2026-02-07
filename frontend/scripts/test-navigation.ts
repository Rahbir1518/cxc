/**
 * Test Script for Indoor Navigation System
 * 
 * Run with: npx tsx scripts/test-navigation.ts
 */

import {
  findPath,
  findRouteToNearest,
  generateInstructions,
  addHazardWarnings,
  generateRouteSummary,
  scienceTeachingComplexBasement,
  findNodeByRoomNumber,
} from '../lib/navigation';

const map = scienceTeachingComplexBasement;

console.log('='.repeat(60));
console.log('Indoor Navigation System - Test Suite');
console.log('='.repeat(60));
console.log(`\nBuilding: ${map.buildingName} (${map.buildingNumber})`);
console.log(`Floor: ${map.floorName}`);
console.log(`Nodes: ${map.nodes.length}`);
console.log(`Edges: ${map.edges.length}`);
console.log(`Alerts: ${map.alerts?.length ?? 0}`);

// Test 1: Find route between two rooms
console.log('\n' + '-'.repeat(60));
console.log('TEST 1: Route from Room 0802 to Room 0815 (Biology 1)');
console.log('-'.repeat(60));

const startRoom = findNodeByRoomNumber(map, '0802');
const endRoom = findNodeByRoomNumber(map, '0815');

if (startRoom && endRoom) {
  const route = findPath(map, startRoom.id, endRoom.id);
  
  if (route) {
    console.log(`\n✓ Route found!`);
    console.log(`  Distance: ${route.totalDistance} meters`);
    console.log(`  Estimated time: ${Math.ceil(route.estimatedTime / 60)} minutes`);
    console.log(`  Path nodes: ${route.path.length}`);
    
    // Generate instructions
    let instructions = generateInstructions(route, map);
    instructions = addHazardWarnings(instructions, map, route.path);
    route.instructions = instructions;
    
    console.log(`\n  Navigation Instructions:`);
    for (const inst of instructions) {
      const priority = inst.priority !== 'normal' ? ` [${inst.priority.toUpperCase()}]` : '';
      console.log(`  ${inst.stepNumber}. ${inst.spokenText}${priority}`);
    }
    
    console.log(`\n  Summary: ${generateRouteSummary(route, map)}`);
  } else {
    console.log('✗ No route found');
  }
} else {
  console.log('✗ Could not find rooms');
}

// Test 2: Find nearest restroom
console.log('\n' + '-'.repeat(60));
console.log('TEST 2: Find nearest restroom from Room 0844');
console.log('-'.repeat(60));

const fromRoom = findNodeByRoomNumber(map, '0844');
if (fromRoom) {
  const restroomRoute = findRouteToNearest(map, fromRoom.id, 'restroom');
  
  if (restroomRoute) {
    const instructions = generateInstructions(restroomRoute, map);
    console.log(`\n✓ Nearest restroom found!`);
    console.log(`  Distance: ${restroomRoute.totalDistance} meters`);
    console.log(`\n  Instructions:`);
    for (const inst of instructions) {
      console.log(`  ${inst.stepNumber}. ${inst.spokenText}`);
    }
  } else {
    console.log('✗ No restroom found');
  }
}

// Test 3: Find nearest elevator
console.log('\n' + '-'.repeat(60));
console.log('TEST 3: Find nearest elevator from Room 0802');
console.log('-'.repeat(60));

if (startRoom) {
  const elevatorRoute = findRouteToNearest(map, startRoom.id, 'elevator');
  
  if (elevatorRoute) {
    const instructions = generateInstructions(elevatorRoute, map);
    console.log(`\n✓ Nearest elevator found!`);
    console.log(`  Distance: ${elevatorRoute.totalDistance} meters`);
    console.log(`\n  Instructions:`);
    for (const inst of instructions) {
      console.log(`  ${inst.stepNumber}. ${inst.spokenText}`);
    }
  } else {
    console.log('✗ No elevator found');
  }
}

// Test 4: Accessibility routing (avoid stairs)
console.log('\n' + '-'.repeat(60));
console.log('TEST 4: Accessibility routing (avoid stairs)');
console.log('-'.repeat(60));

if (startRoom && endRoom) {
  const accessibleRoute = findPath(map, startRoom.id, endRoom.id, {
    avoidStairs: true,
    preferElevators: true,
    avoidCrowdedAreas: false,
  });
  
  if (accessibleRoute) {
    console.log(`\n✓ Accessible route found!`);
    console.log(`  Distance: ${accessibleRoute.totalDistance} meters`);
  }
}

// Test 5: Check active alerts
console.log('\n' + '-'.repeat(60));
console.log('TEST 5: Active Alerts');
console.log('-'.repeat(60));

for (const alert of map.alerts ?? []) {
  console.log(`\n  ⚠ ${alert.type.toUpperCase()}: ${alert.message}`);
  console.log(`    Severity: ${alert.severity}`);
  console.log(`    Affected nodes: ${alert.affectedNodes.join(', ')}`);
}

console.log('\n' + '='.repeat(60));
console.log('Test suite completed!');
console.log('='.repeat(60));
