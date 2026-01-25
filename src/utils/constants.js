/**
 * FLARE Constants
 * Application-wide constants and configuration
 */

export const COLORS = {
  primary: '#FF4444',
  primaryDark: '#CC0000',
  secondary: '#4CAF50',
  warning: '#FFC107',
  danger: '#F44336',
  info: '#2196F3',
  
  background: '#1A1A2E',
  backgroundLight: '#16213E',
  surface: '#0F3460',
  
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  
  border: '#333333',
  
  signalExcellent: '#4CAF50',
  signalGood: '#8BC34A',
  signalFair: '#FFC107',
  signalWeak: '#FF9800',
  signalVeryWeak: '#F44336',
  
  heatMapClear: '#4CAF50',
  heatMapUnstable: '#FFC107',
  heatMapObstacle: '#F44336',
  heatMapUnknown: '#666666',
};

export const BEACON_MODES = {
  PUBLIC: 'public',
  PROFESSIONAL: 'professional',
  PRIVATE: 'private',
};

export const BEACON_STATUS = {
  ACTIVE: 'active',
  RESCUED: 'rescued',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

export const SIGNAL_TYPES = {
  BLUETOOTH: 'bluetooth',
  WIFI: 'wifi',
  UWB: 'uwb',
};

export const RSSI_CONFIG = {
  TX_POWER: -59,
  ENVIRONMENT_FACTORS: {
    FREE_SPACE: 2.0,
    INDOOR_LIGHT: 2.5,
    INDOOR_WALLS: 3.0,
    HEAVY_OBSTACLES: 4.0,
    RUBBLE: 5.0,
  },
  SIGNAL_THRESHOLDS: {
    EXCELLENT: -50,
    GOOD: -60,
    FAIR: -70,
    WEAK: -80,
    VERY_WEAK: -90,
  },
};

export const HEAT_MAP_CONFIG = {
  GRID_SIZE: 2,
  UPDATE_INTERVAL: 500,
  CELL_STATUSES: {
    CLEAR: 'clear',
    OBSTACLE: 'obstacle',
    UNSTABLE: 'unstable',
    UNKNOWN: 'unknown',
  },
};

export const BLUETOOTH_CONFIG = {
  SERVICE_UUID: 'FLARE-SOS-BEACON-SERVICE',
  CHARACTERISTIC_UUID: 'FLARE-SOS-DATA',
  SCAN_DURATION: 10000,
  SCAN_INTERVAL: 2000,
  ADVERTISING_INTERVAL: 100,
};

export const API_CONFIG = {
  BASE_URL: 'http://localhost:8000/api',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
};

export const EMERGENCY_TYPES = [
  { id: 'earthquake', label: 'Earthquake', icon: 'earth' },
  { id: 'flood', label: 'Flood', icon: 'water' },
  { id: 'fire', label: 'Fire', icon: 'fire' },
  { id: 'collapse', label: 'Building Collapse', icon: 'office-building' },
  { id: 'accident', label: 'Accident', icon: 'car-emergency' },
  { id: 'medical', label: 'Medical Emergency', icon: 'medical-bag' },
  { id: 'other', label: 'Other', icon: 'alert-circle' },
];

export const TRIGGER_METHODS = {
  PUBLIC: {
    method: 'Triple Power Button Press',
    description: 'Press power button 3 times quickly to trigger public SOS',
  },
  PROFESSIONAL: {
    method: 'Long Press + Volume Down',
    description: 'Hold power button + volume down for 3 seconds',
  },
  PRIVATE: {
    method: 'In-App Button',
    description: 'Use the SOS button within the app for group alerts',
  },
};
