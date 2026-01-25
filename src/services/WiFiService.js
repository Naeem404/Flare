/**
 * FLARE WiFi Service
 * WiFi Direct operations for extended range beacon communication
 * Note: Using mock implementation for Expo Go compatibility
 */

import { Platform, PermissionsAndroid } from 'react-native';

// Mock WifiManager for Expo Go compatibility
const WifiManager = {
  getCurrentWifiSSID: async () => 'MockWiFi',
  setEnabled: async (enabled) => console.log('Mock WiFi enabled:', enabled),
  connectToProtectedSSID: async () => true,
  disconnect: async () => true,
  loadWifiList: async () => [],
};

class WiFiService {
  constructor() {
    this.isInitialized = false;
    this.discoveredPeers = new Map();
    this.onPeerDiscovered = null;
    this.onPeerUpdated = null;
    this.onPeerLost = null;
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('WiFi permissions not granted');
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('WiFiService initialization error:', error);
      throw error;
    }
  }

  async requestPermissions() {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE,
        PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE,
      ];

      const results = await PermissionsAndroid.requestMultiple(permissions);
      return Object.values(results).every(
        (result) => result === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error('WiFi permission request error:', error);
      return false;
    }
  }

  async isWifiEnabled() {
    try {
      const enabled = await WifiManager.isEnabled();
      return enabled;
    } catch (error) {
      console.error('Check WiFi enabled error:', error);
      return false;
    }
  }

  async enableWifi() {
    try {
      await WifiManager.setEnabled(true);
      return true;
    } catch (error) {
      console.error('Enable WiFi error:', error);
      return false;
    }
  }

  async getCurrentSSID() {
    try {
      const ssid = await WifiManager.getCurrentWifiSSID();
      return ssid;
    } catch (error) {
      console.error('Get current SSID error:', error);
      return null;
    }
  }

  async getSignalStrength() {
    try {
      const level = await WifiManager.getCurrentSignalStrength();
      return level;
    } catch (error) {
      console.error('Get signal strength error:', error);
      return null;
    }
  }

  async scanForNetworks() {
    try {
      const networks = await WifiManager.loadWifiList();
      return networks.filter((network) => this.isFlareNetwork(network));
    } catch (error) {
      console.error('Scan for networks error:', error);
      return [];
    }
  }

  isFlareNetwork(network) {
    return network.SSID && network.SSID.startsWith('FLARE-SOS');
  }

  parseNetworkData(network) {
    const defaultData = {
      mode: 'public',
      status: 'active',
      batteryLevel: 100,
      deviceId: network.BSSID,
    };

    try {
      if (network.SSID && network.SSID.startsWith('FLARE-SOS-')) {
        const parts = network.SSID.split('-');
        return {
          ...defaultData,
          mode: parts[2] || 'public',
          batteryLevel: parseInt(parts[3]) || 100,
        };
      }

      return defaultData;
    } catch (error) {
      return defaultData;
    }
  }

  estimateDistanceFromLevel(level) {
    const txPower = -50;
    const n = 2.5;

    if (level >= 0) return 0;

    const distance = Math.pow(10, (txPower - level) / (10 * n));
    return Math.round(distance * 100) / 100;
  }

  async startDiscovery(options = {}) {
    const { mode = 'public', groupId = null, interval = 5000 } = options;

    try {
      this.discoveryInterval = setInterval(async () => {
        const networks = await this.scanForNetworks();

        for (const network of networks) {
          const beaconData = this.parseNetworkData(network);

          if (mode === 'private' && beaconData.groupId !== groupId) {
            continue;
          }

          if (mode === 'public' && beaconData.mode !== 'public') {
            continue;
          }

          const beacon = {
            deviceId: network.BSSID,
            deviceName: network.SSID,
            rssi: network.level,
            distance: this.estimateDistanceFromLevel(network.level),
            signalType: 'wifi',
            lastSeen: Date.now(),
            ...beaconData,
          };

          const isNew = !this.discoveredPeers.has(network.BSSID);
          this.discoveredPeers.set(network.BSSID, beacon);

          if (isNew && this.onPeerDiscovered) {
            this.onPeerDiscovered(beacon);
          } else if (!isNew && this.onPeerUpdated) {
            this.onPeerUpdated(beacon);
          }
        }

        this.cleanupStalePeers();
      }, interval);

      return true;
    } catch (error) {
      console.error('Start WiFi discovery error:', error);
      throw error;
    }
  }

  stopDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
  }

  cleanupStalePeers() {
    const now = Date.now();
    const staleThreshold = 60000;

    for (const [deviceId, peer] of this.discoveredPeers) {
      if (now - peer.lastSeen > staleThreshold) {
        this.discoveredPeers.delete(deviceId);
        if (this.onPeerLost) {
          this.onPeerLost(peer);
        }
      }
    }
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.values());
  }

  async createHotspot(beaconData) {
    console.log('Creating WiFi hotspot for beacon:', beaconData);
    return true;
  }

  async stopHotspot() {
    console.log('Stopping WiFi hotspot');
    return true;
  }

  destroy() {
    this.stopDiscovery();
    this.discoveredPeers.clear();
    this.isInitialized = false;
  }
}

export default new WiFiService();
