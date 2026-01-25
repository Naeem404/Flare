/**
 * FLARE Navigation Service
 * Distance calculation, direction finding, and navigation guidance
 */

import {
  calculateDistanceFromRSSI,
  getSignalQuality,
  getNavigationGuidance,
  smoothRSSI,
  formatDistance,
} from '../utils/rssiCalculator';
import { RSSI_CONFIG } from '../utils/constants';

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
  }
}

export default new NavigationService();
