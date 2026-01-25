/**
 * FLARE Mock Bluetooth Service
 * Mock implementation for Expo Go compatibility
 */

class MockBluetoothService {
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
      // Mock initialization for Expo Go
      console.log('Mock Bluetooth Service initialized (Expo Go compatibility mode)');
      this.isInitialized = true;
      
      // Simulate Bluetooth being enabled
      if (this.onStateChange) {
        this.onStateChange(true);
      }

      return true;
    } catch (error) {
      console.error('MockBluetoothService initialization error:', error);
      throw error;
    }
  }

  async requestPermissions() {
    console.log('Mock: Bluetooth permissions granted');
    return true;
  }

  async startScan(serviceUUIDs = [], options = {}) {
    console.log('Mock: Starting Bluetooth scan');
    
    // Simulate finding a mock beacon after 3 seconds
    setTimeout(() => {
      if (this.onBeaconDiscovered) {
        const mockBeacon = {
          id: 'mock-beacon-123',
          name: 'FLARE-SOS-PUBLIC-95',
          rssi: -65,
          serviceUUIDs: ['0000180f-0000-1000-8000-00805f9b34fb'],
          manufacturerData: null,
        };
        this.onBeaconDiscovered(mockBeacon);
      }
    }, 3000);

    return true;
  }

  async stopScan() {
    console.log('Mock: Stopping Bluetooth scan');
    return true;
  }

  async connectToDevice(deviceId, options = {}) {
    console.log('Mock: Connecting to device', deviceId);
    return true;
  }

  async disconnectFromDevice(deviceId) {
    console.log('Mock: Disconnecting from device', deviceId);
    return true;
  }

  async retrieveServices(deviceId, serviceUUIDs = []) {
    console.log('Mock: Retrieving services for device', deviceId);
    return [];
  }

  async readCharacteristic(deviceId, serviceUUID, characteristicUUID) {
    console.log('Mock: Reading characteristic');
    return null;
  }

  async writeCharacteristic(deviceId, serviceUUID, characteristicUUID, value) {
    console.log('Mock: Writing characteristic');
    return true;
  }

  async startNotification(deviceId, serviceUUID, characteristicUUID) {
    console.log('Mock: Starting notification');
    return true;
  }

  async stopNotification(deviceId, serviceUUID, characteristicUUID) {
    console.log('Mock: Stopping notification');
    return true;
  }

  destroy() {
    console.log('Mock: Bluetooth service destroyed');
    this.isInitialized = false;
  }

  // Mock event emitter methods
  onStateChange(callback) {
    this.onStateChange = callback;
    return {
      remove: () => {
        this.onStateChange = null;
      }
    };
  }

  onDeviceDiscovered(callback) {
    this.onBeaconDiscovered = callback;
    return {
      remove: () => {
        this.onBeaconDiscovered = null;
      }
    };
  }

  onDeviceUpdated(callback) {
    this.onBeaconUpdated = callback;
    return {
      remove: () => {
        this.onBeaconUpdated = null;
      }
    };
  }

  onDeviceDisconnected(callback) {
    this.onBeaconLost = callback;
    return {
      remove: () => {
        this.onBeaconLost = null;
      }
    };
  }
}

export default MockBluetoothService;
