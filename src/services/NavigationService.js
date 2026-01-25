/**
 * FLARE Navigation Service
 * Distance calculation, direction finding, and navigation guidance
 * Enhanced with hot/cold navigation and obstacle detection
 */

import {
  calculateDistanceFromRSSI,
  getSignalQuality,
  getNavigationGuidance,
  smoothRSSI,
  formatDistance,
} from '../utils/rssiCalculator';
import { RSSI_CONFIG } from '../utils/constants';

// Direction constants for 8-way movement
const DIRECTIONS = {
  NORTH: { name: 'North', dx: 0, dy: -1, icon: 'arrow-up', angle: 0 },
  NORTHEAST: { name: 'Northeast', dx: 1, dy: -1, icon: 'arrow-top-right', angle: 45 },
  EAST: { name: 'East', dx: 1, dy: 0, icon: 'arrow-right', angle: 90 },
  SOUTHEAST: { name: 'Southeast', dx: 1, dy: 1, icon: 'arrow-bottom-right', angle: 135 },
  SOUTH: { name: 'South', dx: 0, dy: 1, icon: 'arrow-down', angle: 180 },
  SOUTHWEST: { name: 'Southwest', dx: -1, dy: 1, icon: 'arrow-bottom-left', angle: 225 },
  WEST: { name: 'West', dx: -1, dy: 0, icon: 'arrow-left', angle: 270 },
  NORTHWEST: { name: 'Northwest', dx: -1, dy: -1, icon: 'arrow-top-left', angle: 315 },
};

class NavigationService {
  constructor() {
    this.targetBeacon = null;
    this.rssiHistory = [];
    this.positionHistory = [];
    this.smoothedRSSI = null;
    this.previousRSSI = null;
    this.environmentFactor = RSSI_CONFIG.ENVIRONMENT_FACTORS.INDOOR_LIGHT;
    this.onNavigationUpdate = null;
    this.onDistanceUpdate = null;
    this.onDirectionUpdate = null;
    
    // Enhanced navigation state
    this.directionSignalMap = {}; // Track signal strength per direction
    this.lastMovementDirection = null;
    this.bestDirection = null;
    this.obstacleDirections = new Set();
    this.hotColdState = 'calibrating'; // 'calibrating', 'getting_warmer', 'getting_colder', 'stable'
    this.calibrationReadings = [];
    this.estimatedVictimDirection = null;
    this.movementHistory = []; // Track movement with signal changes
  }

  setTargetBeacon(beacon) {
    this.targetBeacon = beacon;
    this.rssiHistory = [];
    this.positionHistory = [];
    this.smoothedRSSI = null;
    this.previousRSSI = null;
  }

  clearTarget() {
    this.targetBeacon = null;
    this.rssiHistory = [];
    this.positionHistory = [];
    this.smoothedRSSI = null;
    this.previousRSSI = null;
  }

  setEnvironmentFactor(factor) {
    this.environmentFactor = factor;
  }

  processRSSIReading(rssi, position = null) {
    this.previousRSSI = this.smoothedRSSI;

    this.rssiHistory.push({
      rssi,
      timestamp: Date.now(),
      position,
    });

    if (this.rssiHistory.length > 20) {
      this.rssiHistory.shift();
    }

    this.smoothedRSSI = smoothRSSI(rssi, this.smoothedRSSI, 0.3);

    const distance = calculateDistanceFromRSSI(
      this.smoothedRSSI,
      RSSI_CONFIG.TX_POWER,
      this.environmentFactor
    );

    const signalQuality = getSignalQuality(this.smoothedRSSI);

    const guidance = getNavigationGuidance(this.smoothedRSSI, this.previousRSSI);

    if (position) {
      this.positionHistory.push({
        ...position,
        rssi: this.smoothedRSSI,
        distance,
        timestamp: Date.now(),
      });

      if (this.positionHistory.length > 50) {
        this.positionHistory.shift();
      }
    }

    const result = {
      rssi: Math.round(this.smoothedRSSI),
      rawRssi: rssi,
      distance,
      formattedDistance: formatDistance(distance),
      signalQuality,
      guidance,
      timestamp: Date.now(),
    };

    if (this.onNavigationUpdate) {
      this.onNavigationUpdate(result);
    }

    if (this.onDistanceUpdate) {
      this.onDistanceUpdate(distance, formatDistance(distance));
    }

    if (this.onDirectionUpdate) {
      this.onDirectionUpdate(guidance);
    }

    return result;
  }

  getAverageRSSI(windowMs = 5000) {
    const now = Date.now();
    const recentReadings = this.rssiHistory.filter(
      (r) => now - r.timestamp < windowMs
    );

    if (recentReadings.length === 0) {
      return this.smoothedRSSI;
    }

    return (
      recentReadings.reduce((sum, r) => sum + r.rssi, 0) / recentReadings.length
    );
  }

  getRSSITrend(windowMs = 10000) {
    const now = Date.now();
    const recentReadings = this.rssiHistory.filter(
      (r) => now - r.timestamp < windowMs
    );

    if (recentReadings.length < 3) {
      return { trend: 'unknown', slope: 0 };
    }

    const n = recentReadings.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    recentReadings.forEach((r, i) => {
      sumX += i;
      sumY += r.rssi;
      sumXY += i * r.rssi;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    let trend;
    if (slope > 0.5) {
      trend = 'improving';
    } else if (slope < -0.5) {
      trend = 'degrading';
    } else {
      trend = 'stable';
    }

    return { trend, slope: Math.round(slope * 100) / 100 };
  }

  estimateTimeToReach(targetDistance = 2) {
    if (this.positionHistory.length < 2) {
      return null;
    }

    const recent = this.positionHistory.slice(-10);
    if (recent.length < 2) return null;

    const first = recent[0];
    const last = recent[recent.length - 1];

    const distanceCovered = first.distance - last.distance;
    const timeTaken = (last.timestamp - first.timestamp) / 1000;

    if (distanceCovered <= 0 || timeTaken <= 0) {
      return null;
    }

    const speed = distanceCovered / timeTaken;
    const remainingDistance = last.distance - targetDistance;

    if (remainingDistance <= 0) {
      return 0;
    }

    const estimatedTime = remainingDistance / speed;
    return Math.round(estimatedTime);
  }

  getProximityAlert() {
    if (!this.smoothedRSSI) {
      return null;
    }

    const distance = calculateDistanceFromRSSI(
      this.smoothedRSSI,
      RSSI_CONFIG.TX_POWER,
      this.environmentFactor
    );

    if (distance <= 2) {
      return {
        level: 'arrived',
        message: "📍 You're within 2 meters - start searching!",
        vibrate: true,
        sound: 'success',
      };
    } else if (distance <= 5) {
      return {
        level: 'very_close',
        message: 'Very close! Within 5 meters',
        vibrate: true,
        sound: 'proximity',
      };
    } else if (distance <= 10) {
      return {
        level: 'close',
        message: 'Getting close - within 10 meters',
        vibrate: false,
        sound: null,
      };
    }

    return null;
  }

  calculateBearing(from, to) {
    if (!from || !to || !from.latitude || !to.latitude) {
      return null;
    }

    const lat1 = (from.latitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    bearing = (bearing + 360) % 360;

    return Math.round(bearing);
  }

  getBearingDirection(bearing) {
    if (bearing === null) return 'Unknown';

    const directions = [
      'N',
      'NNE',
      'NE',
      'ENE',
      'E',
      'ESE',
      'SE',
      'SSE',
      'S',
      'SSW',
      'SW',
      'WSW',
      'W',
      'WNW',
      'NW',
      'NNW',
    ];

    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  }

  getMovementVector() {
    if (this.positionHistory.length < 2) {
      return null;
    }

    const recent = this.positionHistory.slice(-5);
    if (recent.length < 2) return null;

    const first = recent[0];
    const last = recent[recent.length - 1];

    if (!first.position || !last.position) {
      return null;
    }

    return {
      dx: last.position.x - first.position.x,
      dy: last.position.y - first.position.y,
      rssiChange: last.rssi - first.rssi,
      distanceChange: first.distance - last.distance,
    };
  }

  suggestDirection() {
    const vector = this.getMovementVector();
    const trend = this.getRSSITrend();

    if (!vector) {
      return {
        suggestion: 'Start moving to calibrate',
        confidence: 0,
        icon: 'compass',
      };
    }

    if (trend.trend === 'improving') {
      return {
        suggestion: 'Keep going this direction ✓',
        confidence: Math.min(1, Math.abs(trend.slope) / 2),
        icon: 'arrow-up',
      };
    } else if (trend.trend === 'degrading') {
      return {
        suggestion: 'Turn around and try another direction ↺',
        confidence: Math.min(1, Math.abs(trend.slope) / 2),
        icon: 'rotate-ccw',
      };
    } else {
      return {
        suggestion: 'Try moving in a different direction',
        confidence: 0.3,
        icon: 'shuffle',
      };
    }
  }

  getNavigationSummary() {
    if (!this.smoothedRSSI) {
      return {
        status: 'no_signal',
        message: 'No beacon signal detected',
      };
    }

    const distance = calculateDistanceFromRSSI(
      this.smoothedRSSI,
      RSSI_CONFIG.TX_POWER,
      this.environmentFactor
    );

    const quality = getSignalQuality(this.smoothedRSSI);
    const trend = this.getRSSITrend();
    const suggestion = this.suggestDirection();
    const eta = this.estimateTimeToReach();
    const alert = this.getProximityAlert();

    return {
      status: 'tracking',
      distance,
      formattedDistance: formatDistance(distance),
      signalQuality: quality,
      trend,
      suggestion,
      eta: eta !== null ? `~${eta}s` : null,
      alert,
      rssi: Math.round(this.smoothedRSSI),
    };
  }

  reset() {
    this.targetBeacon = null;
    this.rssiHistory = [];
    this.positionHistory = [];
    this.smoothedRSSI = null;
    this.previousRSSI = null;
    this.directionSignalMap = {};
    this.lastMovementDirection = null;
    this.bestDirection = null;
    this.obstacleDirections = new Set();
    this.hotColdState = 'calibrating';
    this.calibrationReadings = [];
    this.estimatedVictimDirection = null;
    this.movementHistory = [];
  }

  /**
   * Record movement in a specific direction with signal reading
   * This is the core of hot/cold navigation
   */
  recordMovement(direction, newPosition, rssi) {
    const dirKey = this.getDirectionKey(direction);
    if (!dirKey) return null;

    const previousRssi = this.smoothedRSSI || rssi;
    const rssiChange = rssi - previousRssi;
    
    // Store this movement
    this.movementHistory.push({
      direction: dirKey,
      position: newPosition,
      rssi,
      rssiChange,
      timestamp: Date.now(),
    });

    // Keep only last 50 movements
    if (this.movementHistory.length > 50) {
      this.movementHistory.shift();
    }

    // Update direction signal map
    if (!this.directionSignalMap[dirKey]) {
      this.directionSignalMap[dirKey] = {
        readings: [],
        avgChange: 0,
        isObstacle: false,
        confidence: 0,
      };
    }

    this.directionSignalMap[dirKey].readings.push({
      rssi,
      rssiChange,
      timestamp: Date.now(),
    });

    // Keep only last 10 readings per direction
    if (this.directionSignalMap[dirKey].readings.length > 10) {
      this.directionSignalMap[dirKey].readings.shift();
    }

    // Calculate average change for this direction
    const readings = this.directionSignalMap[dirKey].readings;
    const avgChange = readings.reduce((sum, r) => sum + r.rssiChange, 0) / readings.length;
    this.directionSignalMap[dirKey].avgChange = avgChange;
    this.directionSignalMap[dirKey].confidence = Math.min(1, readings.length / 5);

    // Detect obstacles: if signal consistently drops significantly in a direction
    if (avgChange < -5 && readings.length >= 3) {
      this.directionSignalMap[dirKey].isObstacle = true;
      this.obstacleDirections.add(dirKey);
    } else if (avgChange > -2) {
      this.directionSignalMap[dirKey].isObstacle = false;
      this.obstacleDirections.delete(dirKey);
    }

    // Update hot/cold state
    this.updateHotColdState(rssiChange);

    // Find best direction (highest average signal improvement)
    this.updateBestDirection();

    this.lastMovementDirection = dirKey;

    return this.getNavigationGuidanceEnhanced();
  }

  /**
   * Get direction key from movement delta
   */
  getDirectionKey(direction) {
    if (typeof direction === 'string') {
      return direction;
    }
    
    const { dx, dy } = direction;
    if (dx === 0 && dy < 0) return 'NORTH';
    if (dx > 0 && dy < 0) return 'NORTHEAST';
    if (dx > 0 && dy === 0) return 'EAST';
    if (dx > 0 && dy > 0) return 'SOUTHEAST';
    if (dx === 0 && dy > 0) return 'SOUTH';
    if (dx < 0 && dy > 0) return 'SOUTHWEST';
    if (dx < 0 && dy === 0) return 'WEST';
    if (dx < 0 && dy < 0) return 'NORTHWEST';
    return null;
  }

  /**
   * Update hot/cold state based on recent signal changes
   */
  updateHotColdState(rssiChange) {
    if (this.movementHistory.length < 3) {
      this.hotColdState = 'calibrating';
      return;
    }

    // Look at last 3 movements
    const recent = this.movementHistory.slice(-3);
    const avgRecentChange = recent.reduce((sum, m) => sum + m.rssiChange, 0) / recent.length;

    if (avgRecentChange > 2) {
      this.hotColdState = 'getting_warmer';
    } else if (avgRecentChange < -2) {
      this.hotColdState = 'getting_colder';
    } else {
      this.hotColdState = 'stable';
    }
  }

  /**
   * Find the best direction to move (highest signal improvement)
   */
  updateBestDirection() {
    let bestDir = null;
    let bestAvgChange = -Infinity;

    for (const [dir, data] of Object.entries(this.directionSignalMap)) {
      if (!data.isObstacle && data.confidence >= 0.4 && data.avgChange > bestAvgChange) {
        bestAvgChange = data.avgChange;
        bestDir = dir;
      }
    }

    this.bestDirection = bestDir;
    
    // Estimate victim direction based on best signal direction
    if (bestDir && bestAvgChange > 0) {
      this.estimatedVictimDirection = DIRECTIONS[bestDir];
    }
  }

  /**
   * Get enhanced navigation guidance with hot/cold and obstacle info
   */
  getNavigationGuidanceEnhanced() {
    const distance = this.smoothedRSSI 
      ? calculateDistanceFromRSSI(this.smoothedRSSI, RSSI_CONFIG.TX_POWER, this.environmentFactor)
      : null;

    // Build guidance message
    let message = '';
    let icon = 'compass';
    let confidence = 0;
    let suggestedDirection = null;

    switch (this.hotColdState) {
      case 'calibrating':
        message = '🔄 Walk around slowly to calibrate direction...';
        icon = 'compass';
        confidence = 0;
        break;
      
      case 'getting_warmer':
        message = '🔥 WARMER! Keep going this direction!';
        icon = 'arrow-up';
        confidence = 0.8;
        if (this.lastMovementDirection) {
          suggestedDirection = DIRECTIONS[this.lastMovementDirection];
        }
        break;
      
      case 'getting_colder':
        message = '❄️ COLDER! Turn around or try another direction';
        icon = 'rotate-ccw';
        confidence = 0.7;
        // Suggest opposite direction or best known direction
        if (this.bestDirection) {
          suggestedDirection = DIRECTIONS[this.bestDirection];
          message = `❄️ COLDER! Try moving ${DIRECTIONS[this.bestDirection].name}`;
        }
        break;
      
      case 'stable':
        message = '➡️ Signal stable - try a different direction';
        icon = 'shuffle';
        confidence = 0.4;
        if (this.bestDirection) {
          suggestedDirection = DIRECTIONS[this.bestDirection];
          message = `➡️ Try moving ${DIRECTIONS[this.bestDirection].name}`;
        }
        break;
    }

    // Add obstacle warnings
    const obstacleWarnings = this.getObstacleWarnings();
    if (obstacleWarnings.length > 0) {
      message += `\n⚠️ Blocked: ${obstacleWarnings.join(', ')}`;
    }

    // Add distance info
    if (distance !== null) {
      if (distance < 2) {
        message = `📍 VERY CLOSE! Within 2 meters - search the area!`;
        icon = 'map-marker-check';
        confidence = 1;
      } else if (distance < 5) {
        message = `🎯 Close! About ${formatDistance(distance)} away. ${message}`;
      }
    }

    return {
      message,
      icon,
      confidence,
      suggestedDirection,
      hotColdState: this.hotColdState,
      distance: distance ? formatDistance(distance) : 'Unknown',
      distanceMeters: distance,
      obstacleDirections: Array.from(this.obstacleDirections),
      bestDirection: this.bestDirection ? DIRECTIONS[this.bestDirection] : null,
      directionSignalMap: this.directionSignalMap,
    };
  }

  /**
   * Get list of obstacle direction warnings
   */
  getObstacleWarnings() {
    const warnings = [];
    for (const dir of this.obstacleDirections) {
      if (DIRECTIONS[dir]) {
        warnings.push(DIRECTIONS[dir].name);
      }
    }
    return warnings;
  }

  /**
   * Get grid data for visualization
   * Returns signal strength map for each explored direction
   */
  getDirectionGrid() {
    const grid = [];
    const gridSize = 7; // 7x7 grid
    const center = Math.floor(gridSize / 2);

    for (let y = 0; y < gridSize; y++) {
      const row = [];
      for (let x = 0; x < gridSize; x++) {
        const dx = x - center;
        const dy = y - center;
        
        let cellData = {
          x: dx,
          y: dy,
          status: 'unknown',
          signalStrength: null,
          isRescuer: dx === 0 && dy === 0,
          isEstimatedVictim: false,
          isObstacle: false,
          isBestPath: false,
        };

        if (dx === 0 && dy === 0) {
          cellData.status = 'rescuer';
        } else {
          // Determine direction for this cell
          const dirKey = this.getDirectionKey({ dx: Math.sign(dx), dy: Math.sign(dy) });
          
          if (dirKey && this.directionSignalMap[dirKey]) {
            const dirData = this.directionSignalMap[dirKey];
            
            if (dirData.isObstacle) {
              cellData.status = 'obstacle';
              cellData.isObstacle = true;
            } else if (dirData.avgChange > 2) {
              cellData.status = 'clear';
              cellData.isBestPath = dirKey === this.bestDirection;
            } else if (dirData.avgChange > -2) {
              cellData.status = 'unstable';
            } else {
              cellData.status = 'weak';
            }
            
            cellData.signalStrength = dirData.avgChange;
          }

          // Mark estimated victim direction
          if (this.bestDirection && dirKey === this.bestDirection) {
            // Mark cells in the best direction as potential victim location
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1.5 && dist < 3.5) {
              cellData.isEstimatedVictim = true;
            }
          }
        }

        row.push(cellData);
      }
      grid.push(row);
    }

    return grid;
  }

  /**
   * Get comprehensive navigation state for UI
   */
  getFullNavigationState() {
    const guidance = this.getNavigationGuidanceEnhanced();
    const grid = this.getDirectionGrid();
    const trend = this.getRSSITrend();

    return {
      guidance,
      grid,
      trend,
      rssi: this.smoothedRSSI ? Math.round(this.smoothedRSSI) : null,
      signalQuality: this.smoothedRSSI ? getSignalQuality(this.smoothedRSSI) : null,
      movementCount: this.movementHistory.length,
      isCalibrated: this.movementHistory.length >= 5,
      exploredDirections: Object.keys(this.directionSignalMap).length,
      totalDirections: 8,
    };
  }
}

export default new NavigationService();
