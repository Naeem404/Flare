/**
 * FLARE Bluetooth Service
 * Low-level Bluetooth LE operations for beacon communication
 * Note: Using mock implementation for Expo Go compatibility
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { BLUETOOTH_CONFIG } from '../utils/constants';
import { calculateDistanceFromRSSI } from '../utils/rssiCalculator';

// Mock BleManager for Expo Go compatibility
class MockBleManager {
  constructor() {
    console.log('MockBleManager: Initialized for Expo Go');
  }
  
  onStateChange(callback, immediate = false) {
    if (immediate && callback) callback('PoweredOn');
    return { remove: () => {} };
  }
  
  async state() {
    return 'PoweredOn';
  }
  
  startDeviceScan(serviceUUIDs, options, callback) {
    console.log('MockBleManager: Starting mock scan');
    // Simulate finding a beacon after 3 seconds
    setTimeout(() => {
      if (callback) {
        callback(null, {
          id: 'mock-beacon-123',
          name: 'FLARE-SOS-PUBLIC-95',
          rssi: -65,
        });
      }
    }, 3000);
  }
  
  stopDeviceScan() {
    console.log('MockBleManager: Stopping scan');
  }
  
  destroy() {
    console.log('MockBleManager: Destroyed');
  }
}

class BluetoothService {
  constructor() {
    this.manager = null;
    this.isInitialized = false;
    this.scanSubscription = null;
    this.stateSubscription = null;
    this.discoveredDevices = new Map();
    this.rssiHistory = new Map();
    this.onBeaconDiscovered = null;
    this.onBeaconUpdated = null;
    this.onBeaconLost = null;
    this.onStateChange = null;
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Use mock manager for Expo Go
      this.manager = new MockBleManager();
      
      this.stateSubscription = this.manager.onStateChange((state) => {
        if (this.onStateChange) {
          this.onStateChange(state === 'PoweredOn');
        }
      }, true);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('BluetoothService initialization error:', error);
      throw error;
    }
  }

  async requestPermissions() {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const apiLevel = Platform.Version;

      if (apiLevel >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);
        return Object.values(results).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  async checkBluetoothState() {
    if (!this.manager) {
      return false;
    }

    try {
      const state = await this.manager.state();
      return state === 'PoweredOn';
    } catch (error) {
      console.error('Check Bluetooth state error:', error);
      return false;
    }
  }

  async startScanning(options = {}) {
    if (!this.manager) {
      throw new Error('BluetoothService not initialized');
    }

    const {
      filterFlareOnly = true,
      mode = 'public',
      groupId = null,
      allowDuplicates = true,
    } = options;

    try {
      this.stopScanning();
      this.discoveredDevices.clear();

      this.manager.startDeviceScan(
        null,
        { allowDuplicates },
        (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            return;
          }

          if (!device) return;

          if (filterFlareOnly && !this.isFlareBeacon(device)) {
            return;
          }

          this.processDevice(device, mode, groupId);
        }
      );

      this.startStaleDeviceCleanup();
      return true;
    } catch (error) {
      console.error('Start scanning error:', error);
      throw error;
    }
  }

  stopScanning() {
    if (this.manager) {
      this.manager.stopDeviceScan();
    }
    this.stopStaleDeviceCleanup();
  }

  isFlareBeacon(device) {
    if (device.name && device.name.startsWith('FLARE-SOS')) {
      return true;
    }

    if (device.localName && device.localName.startsWith('FLARE-SOS')) {
      return true;
    }

    return false;
  }

  processDevice(device, mode, groupId) {
    const deviceId = device.id;
    const rssi = device.rssi;

    if (!this.rssiHistory.has(deviceId)) {
      this.rssiHistory.set(deviceId, []);
    }

    const history = this.rssiHistory.get(deviceId);
    history.push(rssi);
    if (history.length > 10) {
      history.shift();
    }

    const smoothedRssi = history.reduce((a, b) => a + b, 0) / history.length;
    const distance = calculateDistanceFromRSSI(smoothedRssi);

    const beaconData = this.parseBeaconData(device);

    if (mode === 'private' && beaconData.groupId !== groupId) {
      return;
    }

    if (mode === 'public' && beaconData.mode !== 'public') {
      return;
    }

    const beacon = {
      deviceId,
      deviceName: device.name || device.localName || 'Unknown',
      rssi: Math.round(smoothedRssi),
      rawRssi: rssi,
      distance,
      lastSeen: Date.now(),
      ...beaconData,
    };

    const isNew = !this.discoveredDevices.has(deviceId);
    this.discoveredDevices.set(deviceId, beacon);

    if (isNew && this.onBeaconDiscovered) {
      this.onBeaconDiscovered(beacon);
    } else if (!isNew && this.onBeaconUpdated) {
      this.onBeaconUpdated(beacon);
    }
  }

  parseBeaconData(device) {
    const defaultData = {
      mode: 'public',
      status: 'active',
      batteryLevel: 100,
      message: null,
      groupId: null,
      emergencyType: null,
    };

    try {
      if (device.name && device.name.startsWith('FLARE-SOS-')) {
        const parts = device.name.split('-');
        return {
          ...defaultData,
          mode: parts[2] || 'public',
          batteryLevel: parseInt(parts[3]) || 100,
          groupId: parts[4] || null,
        };
      }

      return defaultData;
    } catch (error) {
      return defaultData;
    }
  }

  startStaleDeviceCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 30000;

      for (const [deviceId, beacon] of this.discoveredDevices) {
        if (now - beacon.lastSeen > staleThreshold) {
          this.discoveredDevices.delete(deviceId);
          this.rssiHistory.delete(deviceId);
          if (this.onBeaconLost) {
            this.onBeaconLost(beacon);
          }
        }
      }
    }, 5000);
  }

  stopStaleDeviceCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getDiscoveredBeacons() {
    return Array.from(this.discoveredDevices.values());
  }

  getBeaconById(deviceId) {
    return this.discoveredDevices.get(deviceId);
  }

  async startAdvertising(beaconData) {
    console.log('Starting BLE advertising with data:', beaconData);
    return true;
  }

  stopAdvertising() {
    console.log('Stopping BLE advertising');
  }

  destroy() {
    this.stopScanning();
    this.stopAdvertising();
    
    if (this.stateSubscription) {
      this.stateSubscription.remove();
    }
    
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
    
    this.isInitialized = false;
    this.discoveredDevices.clear();
    this.rssiHistory.clear();
  }
}

export default new BluetoothService();
