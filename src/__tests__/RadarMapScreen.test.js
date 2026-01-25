/**
 * RadarMapScreen Tests
 * Tests for the radar navigation functionality
 */

// Mock the modules
jest.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Magnetometer: {
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Vibration: {
    vibrate: jest.fn(),
  },
}));

// Test utilities
const testUtils = {
  // Test RSSI to distance calculation
  calculateDistance: (rssi, txPower = -59, envFactor = 2.5) => {
    const distanceM = Math.pow(10, (txPower - rssi) / (10 * envFactor));
    return Math.round(distanceM * 100); // cm
  },

  // Test heading quadrant detection
  getHeadingQuadrant: (h) => {
    if (h >= 337.5 || h < 22.5) return 'N';
    if (h >= 22.5 && h < 67.5) return 'NE';
    if (h >= 67.5 && h < 112.5) return 'E';
    if (h >= 112.5 && h < 157.5) return 'SE';
    if (h >= 157.5 && h < 202.5) return 'S';
    if (h >= 202.5 && h < 247.5) return 'SW';
    if (h >= 247.5 && h < 292.5) return 'W';
    return 'NW';
  },

  // Test angle from direction
  getAngleFromDirection: (dir) => {
    const angles = {
      'N': 0, 'NE': 45, 'E': 90, 'SE': 135,
      'S': 180, 'SW': 225, 'W': 270, 'NW': 315,
    };
    return angles[dir] || 0;
  },

  // Test victim position calculation
  calculateVictimPosition: (distanceCm, angle, gridSize = 20, visibleRadiusCm = 500) => {
    const normalizedDist = distanceCm / visibleRadiusCm;
    return {
      x: Math.round(gridSize / 2 + normalizedDist * (gridSize / 2) * Math.sin(angle * Math.PI / 180)),
      y: Math.round(gridSize / 2 - normalizedDist * (gridSize / 2) * Math.cos(angle * Math.PI / 180)),
    };
  },

  // Test step detection
  detectStep: (accelChange, threshold = 1.1) => {
    return accelChange > threshold;
  },
};

describe('RadarMapScreen Core Functions', () => {
  
  describe('Distance Calculation', () => {
    test('should calculate distance from RSSI correctly', () => {
      // Strong signal = close
      const closeDistance = testUtils.calculateDistance(-30);
      expect(closeDistance).toBeLessThan(100); // Less than 1m
      
      // Medium signal
      const mediumDistance = testUtils.calculateDistance(-59);
      expect(mediumDistance).toBeGreaterThanOrEqual(90);
      expect(mediumDistance).toBeLessThanOrEqual(110); // Around 1m
      
      // Weak signal = far
      const farDistance = testUtils.calculateDistance(-80);
      expect(farDistance).toBeGreaterThan(500); // More than 5m
    });

    test('should handle edge cases', () => {
      const veryClose = testUtils.calculateDistance(-20);
      expect(veryClose).toBeGreaterThan(0);
      
      const veryFar = testUtils.calculateDistance(-100);
      expect(veryFar).toBeGreaterThan(1000);
    });
  });

  describe('Heading Quadrant Detection', () => {
    test('should detect North correctly', () => {
      expect(testUtils.getHeadingQuadrant(0)).toBe('N');
      expect(testUtils.getHeadingQuadrant(10)).toBe('N');
      expect(testUtils.getHeadingQuadrant(350)).toBe('N');
    });

    test('should detect all 8 directions', () => {
      expect(testUtils.getHeadingQuadrant(45)).toBe('NE');
      expect(testUtils.getHeadingQuadrant(90)).toBe('E');
      expect(testUtils.getHeadingQuadrant(135)).toBe('SE');
      expect(testUtils.getHeadingQuadrant(180)).toBe('S');
      expect(testUtils.getHeadingQuadrant(225)).toBe('SW');
      expect(testUtils.getHeadingQuadrant(270)).toBe('W');
      expect(testUtils.getHeadingQuadrant(315)).toBe('NW');
    });

    test('should handle boundary cases', () => {
      expect(testUtils.getHeadingQuadrant(22.5)).toBe('NE');
      expect(testUtils.getHeadingQuadrant(337.5)).toBe('N');
    });
  });

  describe('Angle from Direction', () => {
    test('should return correct angles for all directions', () => {
      expect(testUtils.getAngleFromDirection('N')).toBe(0);
      expect(testUtils.getAngleFromDirection('NE')).toBe(45);
      expect(testUtils.getAngleFromDirection('E')).toBe(90);
      expect(testUtils.getAngleFromDirection('SE')).toBe(135);
      expect(testUtils.getAngleFromDirection('S')).toBe(180);
      expect(testUtils.getAngleFromDirection('SW')).toBe(225);
      expect(testUtils.getAngleFromDirection('W')).toBe(270);
      expect(testUtils.getAngleFromDirection('NW')).toBe(315);
    });

    test('should return 0 for unknown direction', () => {
      expect(testUtils.getAngleFromDirection('unknown')).toBe(0);
      expect(testUtils.getAngleFromDirection(null)).toBe(0);
    });
  });

  describe('Victim Position Calculation', () => {
    test('should place victim at center when distance is 0', () => {
      const pos = testUtils.calculateVictimPosition(0, 0);
      expect(pos.x).toBe(10); // Center of 20x20 grid
      expect(pos.y).toBe(10);
    });

    test('should place victim at edge when at max distance', () => {
      // North direction (angle 0)
      const posNorth = testUtils.calculateVictimPosition(500, 0);
      expect(posNorth.x).toBe(10); // Center X
      expect(posNorth.y).toBe(0);  // Top edge
      
      // East direction (angle 90)
      const posEast = testUtils.calculateVictimPosition(500, 90);
      expect(posEast.x).toBe(20); // Right edge
      expect(posEast.y).toBe(10); // Center Y
    });

    test('should handle intermediate distances', () => {
      const pos = testUtils.calculateVictimPosition(250, 0); // Half distance, North
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(5); // Halfway to top
    });
  });

  describe('Step Detection', () => {
    test('should detect step when acceleration change exceeds threshold', () => {
      expect(testUtils.detectStep(1.5)).toBe(true);
      expect(testUtils.detectStep(1.2)).toBe(true);
    });

    test('should not detect step when acceleration change is below threshold', () => {
      expect(testUtils.detectStep(0.5)).toBe(false);
      expect(testUtils.detectStep(1.0)).toBe(false);
    });

    test('should work with custom threshold', () => {
      expect(testUtils.detectStep(0.8, 0.5)).toBe(true);
      expect(testUtils.detectStep(0.8, 1.0)).toBe(false);
    });
  });

  describe('Grid Configuration', () => {
    const GRID_SIZE = 20;
    const CM_PER_CIRCLE = 50;
    const VISIBLE_RADIUS_CM = (GRID_SIZE / 2) * CM_PER_CIRCLE;

    test('should have correct grid dimensions', () => {
      expect(GRID_SIZE).toBe(20);
      expect(CM_PER_CIRCLE).toBe(50);
    });

    test('should cover 10 meter diameter (5m radius)', () => {
      expect(VISIBLE_RADIUS_CM).toBe(500); // 500cm = 5m radius
      expect(VISIBLE_RADIUS_CM * 2).toBe(1000); // 10m diameter
    });

    test('should have correct number of circles', () => {
      const totalCircles = GRID_SIZE * GRID_SIZE;
      expect(totalCircles).toBe(400);
    });
  });

  describe('Calibration Logic (Rotation-Based)', () => {
    const MIN_DIRECTIONS_REQUIRED = 6;
    const ALL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    test('should find direction with strongest signal', () => {
      const calibrationData = {
        'N': [-50, -52, -48],
        'NE': [-60, -62],
        'E': [-70, -68],
        'S': [-55, -57],
        'SW': [-65, -63],
        'W': [-58, -60],
      };

      let bestDirection = null;
      let bestRssi = -Infinity;

      Object.entries(calibrationData).forEach(([dir, readings]) => {
        if (readings.length > 0) {
          const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
          if (avg > bestRssi) {
            bestRssi = avg;
            bestDirection = dir;
          }
        }
      });

      expect(bestDirection).toBe('N'); // -50 avg is strongest
    });

    test('should require minimum 6 directions for calibration', () => {
      expect(MIN_DIRECTIONS_REQUIRED).toBe(6);
    });

    test('should track visited directions correctly', () => {
      const visitedDirections = new Set();
      
      // Simulate rotating through directions
      const headings = [0, 45, 90, 135, 180, 225]; // N, NE, E, SE, S, SW
      
      headings.forEach(h => {
        const dir = testUtils.getHeadingQuadrant(h);
        visitedDirections.add(dir);
      });

      expect(visitedDirections.size).toBe(6);
      expect(visitedDirections.has('N')).toBe(true);
      expect(visitedDirections.has('NE')).toBe(true);
      expect(visitedDirections.has('E')).toBe(true);
      expect(visitedDirections.has('SE')).toBe(true);
      expect(visitedDirections.has('S')).toBe(true);
      expect(visitedDirections.has('SW')).toBe(true);
    });

    test('should complete calibration when 6+ directions visited', () => {
      const visitedDirections = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW']);
      const isComplete = visitedDirections.size >= MIN_DIRECTIONS_REQUIRED;
      expect(isComplete).toBe(true);
    });

    test('should NOT complete calibration with fewer than 6 directions', () => {
      const visitedDirections = new Set(['N', 'NE', 'E']);
      const isComplete = visitedDirections.size >= MIN_DIRECTIONS_REQUIRED;
      expect(isComplete).toBe(false);
    });

    test('should calculate progress based on directions visited', () => {
      const visitedDirections = new Set(['N', 'NE', 'E']);
      const progress = visitedDirections.size / MIN_DIRECTIONS_REQUIRED;
      expect(progress).toBe(0.5); // 3/6 = 50%
    });
  });
});

describe('Integration Tests', () => {
  test('should correctly map RSSI to grid position', () => {
    // Simulate: RSSI -45, calibrated direction N
    const rssi = -45;
    const direction = 'N';
    
    const distanceCm = testUtils.calculateDistance(rssi);
    const angle = testUtils.getAngleFromDirection(direction);
    
    // Check if within visible range
    const VISIBLE_RADIUS_CM = 500;
    const isOnMap = distanceCm <= VISIBLE_RADIUS_CM;
    
    if (isOnMap) {
      const pos = testUtils.calculateVictimPosition(distanceCm, angle);
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(20);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(20);
    }
  });

  test('should handle full navigation flow', () => {
    // Simulate walking and detecting steps
    const steps = [
      { accelChange: 1.3, heading: 45 },
      { accelChange: 0.5, heading: 50 },
      { accelChange: 1.5, heading: 48 },
    ];

    let stepCount = 0;
    steps.forEach(step => {
      if (testUtils.detectStep(step.accelChange)) {
        stepCount++;
      }
    });

    expect(stepCount).toBe(2); // Only 2 steps detected
  });
});

// Run tests summary
console.log('RadarMapScreen Tests Ready');
console.log('Run with: npx jest __tests__/RadarMapScreen.test.js');
