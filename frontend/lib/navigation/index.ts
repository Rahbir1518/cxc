// Navigation Library Exports
export * from './routing';
export * from './instructions';

// Re-export map data
export { 
  scienceTeachingComplexBasement,
  getMapById,
  getAvailableMaps,
  findNodeByRoomNumber,
  findNearestByType,
} from '../maps/stc-basement';
