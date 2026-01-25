/**
 * FLARE Beacon Network Service
 * Network-based beacon discovery for Expo Go compatibility
 * Since Expo Go doesn't support real BLE, we use network/API to sync beacons
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Use your computer's local IP address for the Django backend
// Replace with your actual IP when testing
const API_BASE_URL = 'http://192.168.3.31:8000/api';

class BeaconNetworkService {
  constructor() {
    this.isInitialized = false;
    this.activeBeacons = new Map();
    this.myBeacon = null;
    this.pollingInterval = null;
    this.onBeaconDiscovered = null;
    this.onBeaconUpdated = null;
    this.onBeaconLost = null;
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('BeaconNetworkService: Initializing...');
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('BeaconNetworkService initialization error:', error);
      throw error;
    }
  }

  // Victim: Activate SOS beacon and register with server
  async activateBeacon(beaconData) {
    try {
      console.log('BeaconNetworkService: Activating beacon...', beaconData);
      
      const payload = {
        device_id: beaconData.deviceId,
        device_name: beaconData.deviceName || 'Unknown Device',
        mode: beaconData.mode || 'public',
        status: 'active',
        battery_level: beaconData.batteryLevel || 100,
        emergency_type: beaconData.emergencyType || 'general',
        message: beaconData.message || '',
        group_id: beaconData.groupId || null,
        latitude: beaconData.latitude || null,
        longitude: beaconData.longitude || null,
      };

      // Try to register with backend
      try {
        const response = await fetch(`${API_BASE_URL}/beacons/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('BeaconNetworkService: Beacon registered with server:', data);
          this.myBeacon = { ...payload, id: data.id };
        } else {
          console.log('BeaconNetworkService: Server registration failed, using local storage');
          await this.storeBeaconLocally(payload);
        }
      } catch (networkError) {
        console.log('BeaconNetworkService: Network error, storing locally:', networkError.message);
        await this.storeBeaconLocally(payload);
      }

      this.myBeacon = payload;
      
      // Start heartbeat to keep beacon active
      this.startHeartbeat();
      
      return true;
    } catch (error) {
      console.error('BeaconNetworkService: Activate beacon error:', error);
      throw error;
    }
  }

  async storeBeaconLocally(beaconData) {
    try {
      const beacons = await this.getLocalBeacons();
      beacons[beaconData.device_id] = {
        ...beaconData,
        lastSeen: Date.now(),
      };
      await AsyncStorage.setItem('flare_active_beacons', JSON.stringify(beacons));
      console.log('BeaconNetworkService: Beacon stored locally');
    } catch (error) {
      console.error('BeaconNetworkService: Local storage error:', error);
    }
  }

  async getLocalBeacons() {
    try {
      const data = await AsyncStorage.getItem('flare_active_beacons');
      return data ? JSON.parse(data) : {};
    } catch (error) {
      return {};
    }
  }

  // Victim: Deactivate SOS beacon
  async deactivateBeacon() {
    try {
      console.log('BeaconNetworkService: Deactivating beacon...');
      
      if (this.myBeacon) {
        // Try to update server
        try {
          await fetch(`${API_BASE_URL}/beacons/${this.myBeacon.device_id}/deactivate/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.log('BeaconNetworkService: Server deactivation failed');
        }

        // Remove from local storage
        const beacons = await this.getLocalBeacons();
        delete beacons[this.myBeacon.device_id];
        await AsyncStorage.setItem('flare_active_beacons', JSON.stringify(beacons));
      }

      this.stopHeartbeat();
      this.myBeacon = null;
      
      return true;
    } catch (error) {
      console.error('BeaconNetworkService: Deactivate beacon error:', error);
      throw error;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      if (this.myBeacon) {
        try {
          await this.storeBeaconLocally(this.myBeacon);
          console.log('BeaconNetworkService: Heartbeat sent');
        } catch (error) {
          console.error('BeaconNetworkService: Heartbeat error:', error);
        }
      }
    }, 5000); // Every 5 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Rescuer: Start scanning for beacons
  async startScanning(options = {}) {
    try {
      console.log('BeaconNetworkService: Starting beacon scan...');
      
      const { mode = 'public', groupId = null } = options;
      
      // Initial scan
      await this.scanForBeacons(mode, groupId);
      
      // Start polling
      this.pollingInterval = setInterval(async () => {
        await this.scanForBeacons(mode, groupId);
      }, 3000); // Poll every 3 seconds
      
      return true;
    } catch (error) {
      console.error('BeaconNetworkService: Start scanning error:', error);
      throw error;
    }
  }

  async scanForBeacons(mode, groupId) {
    try {
      let beacons = [];
      
      // Try to fetch from server first
      try {
        const response = await fetch(`${API_BASE_URL}/beacons/?status=active&mode=${mode}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          beacons = data.results || data || [];
          console.log('BeaconNetworkService: Found beacons from server:', beacons.length);
        }
      } catch (networkError) {
        console.log('BeaconNetworkService: Server fetch failed, using local storage');
      }

      // Also check local storage for beacons on same network
      const localBeacons = await this.getLocalBeacons();
      const now = Date.now();
      
      for (const [deviceId, beacon] of Object.entries(localBeacons)) {
        // Only include beacons seen in last 30 seconds
        if (now - beacon.lastSeen < 30000) {
          // Don't include our own beacon
          if (!this.myBeacon || deviceId !== this.myBeacon.device_id) {
            // Filter by mode
            if (mode === 'public' && beacon.mode === 'public') {
              beacons.push(beacon);
            } else if (mode === 'private' && beacon.group_id === groupId) {
              beacons.push(beacon);
            }
          }
        } else {
          // Remove stale beacon
          delete localBeacons[deviceId];
        }
      }
      
      // Update local storage with cleaned beacons
      await AsyncStorage.setItem('flare_active_beacons', JSON.stringify(localBeacons));

      // Process discovered beacons
      this.processDiscoveredBeacons(beacons);
      
    } catch (error) {
      console.error('BeaconNetworkService: Scan error:', error);
    }
  }

  processDiscoveredBeacons(beacons) {
    const currentIds = new Set();
    
    for (const beacon of beacons) {
      const deviceId = beacon.device_id;
      currentIds.add(deviceId);
      
      // Simulate RSSI based on time (for demo purposes)
      const simulatedRssi = -50 - Math.floor(Math.random() * 30);
      const simulatedDistance = Math.pow(10, (-59 - simulatedRssi) / (10 * 2));
      
      const beaconData = {
        deviceId: deviceId,
        deviceName: beacon.device_name || `FLARE-SOS-${beacon.mode?.toUpperCase() || 'PUBLIC'}`,
        rssi: simulatedRssi,
        distance: Math.round(simulatedDistance * 10) / 10,
        batteryLevel: beacon.battery_level || 100,
        emergencyType: beacon.emergency_type || 'general',
        message: beacon.message || '',
        mode: beacon.mode || 'public',
        status: beacon.status || 'active',
        lastSeen: Date.now(),
      };

      const isNew = !this.activeBeacons.has(deviceId);
      this.activeBeacons.set(deviceId, beaconData);

      if (isNew && this.onBeaconDiscovered) {
        console.log('BeaconNetworkService: New beacon discovered:', beaconData);
        this.onBeaconDiscovered(beaconData);
      } else if (!isNew && this.onBeaconUpdated) {
        this.onBeaconUpdated(beaconData);
      }
    }

    // Check for lost beacons
    for (const [deviceId, beacon] of this.activeBeacons) {
      if (!currentIds.has(deviceId)) {
        this.activeBeacons.delete(deviceId);
        if (this.onBeaconLost) {
          this.onBeaconLost(beacon);
        }
      }
    }
  }

  // Rescuer: Stop scanning
  stopScanning() {
    console.log('BeaconNetworkService: Stopping beacon scan...');
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  getActiveBeacons() {
    return Array.from(this.activeBeacons.values());
  }

  getBeaconById(deviceId) {
    return this.activeBeacons.get(deviceId);
  }

  destroy() {
    this.stopScanning();
    this.stopHeartbeat();
    this.activeBeacons.clear();
    this.isInitialized = false;
  }
}

export default new BeaconNetworkService();
