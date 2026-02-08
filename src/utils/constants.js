/**
 * FLARE Constants
 * Application-wide constants and configuration
 */

export const COLORS = {
  // Backgrounds
  background: '#0A0A0F',
  backgroundLight: '#111118',
  surface: '#1A1A24',
  surfaceLight: '#242430',

  // Primary (Gold/Amber)
  primary: '#FFB800',
  primaryDark: '#E5A600',
  primaryLight: '#FFD54F',

  // Emergency (Red - ONLY for SOS, danger, alerts)
  emergency: '#FF3B30',
  emergencyDark: '#CC2D26',
  emergencyGlow: 'rgba(255, 59, 48, 0.3)',

  // Status Colors
  success: '#4CD964',
  warning: '#FF9500',
  danger: '#FF3B30',
  info: '#5AC8FA',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B8B8C0',
  textMuted: '#6B6B78',
  textGold: '#FFB800',

  // Legacy support (maps to new colors)
  text: '#FFFFFF',
  border: '#333333',

  // Signal colors (green→yellow→red spectrum)
  signalExcellent: '#4CD964',
  signalGood: '#8BC34A',
  signalFair: '#FF9500',
  signalWeak: '#FF9500',
  signalVeryWeak: '#FF3B30',

  // Heat map
  heatMapClear: '#4CD964',
  heatMapUnstable: '#FF9500',
  heatMapObstacle: '#FF3B30',
  heatMapUnknown: '#6B6B78',
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
