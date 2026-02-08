/**
 * FLARE RSSI Calculator
 * Converts signal strength to distance and provides navigation guidance
 */

import { RSSI_CONFIG, COLORS } from './constants';

/**
 * Calculate estimated distance from RSSI value
 * Formula: distance = 10 ^ ((txPower - rssi) / (10 * n))
 * 
 * @param {number} rssi - Received Signal Strength Indicator (negative dBm)
 * @param {number} txPower - Calibrated TX power at 1 meter (default -59 dBm)
 * @param {number} environmentFactor - Path loss exponent (n)
 * @returns {number} Estimated distance in meters
 */
export const calculateDistanceFromRSSI = (
  rssi,
  txPower = RSSI_CONFIG.TX_POWER,
  environmentFactor = RSSI_CONFIG.ENVIRONMENT_FACTORS.INDOOR_LIGHT
) => {
  if (rssi >= 0) return 0;
  
  try {
    const ratio = (txPower - rssi) / (10 * environmentFactor);
    const distance = Math.pow(10, ratio);
    return Math.round(distance * 100) / 100;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return 999;
  }
};

/**
 * Get signal quality level and description
 * @param {number} rssi - RSSI value
 * @returns {Object} Signal quality information
 */
export const getSignalQuality = (rssi) => {
  const { SIGNAL_THRESHOLDS } = RSSI_CONFIG;
  
  if (rssi >= SIGNAL_THRESHOLDS.EXCELLENT) {
    return {
      level: 'excellent',
      description: 'Excellent - Very close',
      color: COLORS.signalExcellent,
      bars: 5,
    };
  } else if (rssi >= SIGNAL_THRESHOLDS.GOOD) {
    return {
      level: 'good',
      description: 'Good - Within 5m',
      color: COLORS.signalGood,
      bars: 4,
    };
  } else if (rssi >= SIGNAL_THRESHOLDS.FAIR) {
    return {
      level: 'fair',
      description: 'Fair - Within 10m',
      color: COLORS.signalFair,
      bars: 3,
    };
  } else if (rssi >= SIGNAL_THRESHOLDS.WEAK) {
    return {
      level: 'weak',
      description: 'Weak - Within 20m',
      color: COLORS.signalWeak,
      bars: 2,
    };
  } else if (rssi >= SIGNAL_THRESHOLDS.VERY_WEAK) {
    return {
      level: 'very_weak',
      description: 'Very Weak - Far away',
      color: COLORS.signalVeryWeak,
      bars: 1,
    };
  } else {
    return {
      level: 'minimal',
      description: 'Minimal - At range limit',
      color: COLORS.signalVeryWeak,
      bars: 0,
    };
  }
};

/**
 * Get navigation guidance based on RSSI changes
 * @param {number} currentRSSI - Current RSSI reading
 * @param {number} previousRSSI - Previous RSSI reading
 * @param {number} threshold - Minimum change to consider significant
 * @returns {Object} Navigation guidance
 */
export const getNavigationGuidance = (currentRSSI, previousRSSI, threshold = 3) => {
  if (previousRSSI === null || previousRSSI === undefined) {
    return {
      direction: 'unknown',
      message: 'Start moving to calibrate direction',
      icon: 'compass',
      confidence: 0,
    };
  }
  
  const change = currentRSSI - previousRSSI;
  
  if (Math.abs(change) < threshold) {
    return {
      direction: 'stable',
      message: 'Signal stable - try moving in a different direction',
      icon: 'minus',
      confidence: 0.3,
      rssiChange: change,
    };
  } else if (change > 0) {
    const confidence = Math.min(1, Math.abs(change) / 10);
    return {
      direction: 'closer',
      message: 'Getting closer! Keep going this direction ✓',
      icon: 'arrow-up',
      confidence,
      rssiChange: change,
    };
  } else {
    const confidence = Math.min(1, Math.abs(change) / 10);
    return {
      direction: 'farther',
      message: 'Moving away - turn around ↺',
      icon: 'arrow-down',
      confidence,
      rssiChange: change,
    };
  }
};

/**
 * Classify heat map cell based on signal readings
 * @param {number[]} signalReadings - Array of RSSI readings for this cell
 * @returns {string} Cell status
 */
export const classifyCellStatus = (signalReadings) => {
  if (!signalReadings || signalReadings.length === 0) {
    return 'unknown';
  }
  
  const avgSignal = signalReadings.reduce((a, b) => a + b, 0) / signalReadings.length;
  const variance = signalReadings.reduce((sum, val) => {
    return sum + Math.pow(val - avgSignal, 2);
  }, 0) / signalReadings.length;
  
  if (variance > 100) {
    return 'unstable';
  }
  
  if (avgSignal >= -70) {
    return 'clear';
  } else if (avgSignal >= -85) {
    return 'unstable';
  } else {
    return 'obstacle';
  }
};

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string
 */
export const formatDistance = (meters) => {
  if (meters < 1) {
    return `${Math.round(meters * 100)} cm`;
  } else if (meters < 10) {
    return `${meters.toFixed(1)} m`;
  } else {
    return `${Math.round(meters)} m`;
  }
};

/**
 * Format battery status with warning indicators
 * @param {number} level - Battery percentage
 * @returns {Object} Formatted battery status
 */
export const formatBatteryStatus = (level) => {
  if (level <= 10) {
    return {
      text: `⚠️ CRITICAL: ${level}%`,
      color: COLORS.danger,
      icon: 'battery-alert',
      priority: 'critical',
    };
  } else if (level <= 20) {
    return {
      text: `⚠️ Low: ${level}%`,
      color: COLORS.warning,
      icon: 'battery-low',
      priority: 'low',
    };
  } else if (level <= 50) {
    return {
      text: `${level}%`,
      color: COLORS.warning,
      icon: 'battery-medium',
      priority: 'normal',
    };
  } else {
    return {
      text: `✓ ${level}%`,
      color: COLORS.success,
      icon: 'battery-high',
      priority: 'good',
    };
  }
};

/**
 * Smooth RSSI readings using exponential moving average
 * @param {number} newValue - New RSSI reading
 * @param {number} previousSmoothed - Previous smoothed value
 * @param {number} alpha - Smoothing factor (0-1, higher = more responsive)
 * @returns {number} Smoothed RSSI value
 */
export const smoothRSSI = (newValue, previousSmoothed, alpha = 0.3) => {
  if (previousSmoothed === null || previousSmoothed === undefined) {
    return newValue;
  }
  return alpha * newValue + (1 - alpha) * previousSmoothed;
};

/**
 * Estimate position using trilateration from multiple beacons
 * @param {Array} beaconDistances - Array of {x, y, distance} objects
 * @returns {Object|null} Estimated {x, y} position or null
 */
export const trilateratePosition = (beaconDistances) => {
  if (beaconDistances.length < 3) {
    return null;
  }
  
  try {
    const [b1, b2, b3] = beaconDistances.slice(0, 3);
    
    const A = 2 * (b2.x - b1.x);
    const B = 2 * (b2.y - b1.y);
    const C = Math.pow(b1.distance, 2) - Math.pow(b2.distance, 2) - 
              Math.pow(b1.x, 2) + Math.pow(b2.x, 2) - 
              Math.pow(b1.y, 2) + Math.pow(b2.y, 2);
    
    const D = 2 * (b3.x - b2.x);
    const E = 2 * (b3.y - b2.y);
    const F = Math.pow(b2.distance, 2) - Math.pow(b3.distance, 2) - 
              Math.pow(b2.x, 2) + Math.pow(b3.x, 2) - 
              Math.pow(b2.y, 2) + Math.pow(b3.y, 2);
    
    const denominator = A * E - B * D;
    if (Math.abs(denominator) < 0.0001) {
      return null;
    }
    
    const x = (C * E - B * F) / denominator;
    const y = (A * F - C * D) / denominator;
    
    return {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
  } catch (error) {
    console.error('Trilateration error:', error);
    return null;
  }
};
