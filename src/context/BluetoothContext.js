/**
 * FLARE Bluetooth Context
 * Manages Bluetooth LE scanning and advertising for beacon communication
 * Uses real BLE via react-native-ble-plx for Development Build
 */

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert, NativeModules, NativeEventEmitter } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import BLEPeripheral from 'react-native-ble-peripheral';
import { BLUETOOTH_CONFIG, BEACON_STATUS } from '../utils/constants';
import { calculateDistanceFromRSSI, smoothRSSI } from '../utils/rssiCalculator';

// FLARE Beacon Service UUID - used for both advertising and scanning
const FLARE_SERVICE_UUID = 'F1A2E3B4-C5D6-7890-ABCD-EF1234567890';
const FLARE_CHARACTERISTIC_UUID = 'F1A2E3B4-C5D6-7890-ABCD-EF1234567891';

console.log('DEBUG: BluetoothContext using BLE Central (scanning) + Peripheral (advertising)');

const BluetoothContext = createContext();

const initialState = {
  isBluetoothEnabled: false,
  isScanning: false,
  isAdvertising: false,
  detectedBeacons: [],
  selectedBeacon: null,
  scanError: null,
  permissionsGranted: false,
};

const actionTypes = {
  SET_BLUETOOTH_ENABLED: 'SET_BLUETOOTH_ENABLED',
  SET_SCANNING: 'SET_SCANNING',
  SET_ADVERTISING: 'SET_ADVERTISING',
  ADD_BEACON: 'ADD_BEACON',
  UPDATE_BEACON: 'UPDATE_BEACON',
  REMOVE_BEACON: 'REMOVE_BEACON',
  CLEAR_BEACONS: 'CLEAR_BEACONS',
  SELECT_BEACON: 'SELECT_BEACON',
  SET_ERROR: 'SET_ERROR',
  SET_PERMISSIONS: 'SET_PERMISSIONS',
};

const bluetoothReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_BLUETOOTH_ENABLED:
      return { ...state, isBluetoothEnabled: action.payload };
    
    case actionTypes.SET_SCANNING:
      return { ...state, isScanning: action.payload };
    
    case actionTypes.SET_ADVERTISING:
      return { ...state, isAdvertising: action.payload };
    
    case actionTypes.ADD_BEACON:
      const existingIndex = state.detectedBeacons.findIndex(
        b => b.deviceId === action.payload.deviceId
      );
      if (existingIndex >= 0) {
        const updatedBeacons = [...state.detectedBeacons];
        updatedBeacons[existingIndex] = {
          ...updatedBeacons[existingIndex],
          ...action.payload,
          lastSeen: Date.now(),
        };
        return { ...state, detectedBeacons: updatedBeacons };
      }
      return {
        ...state,
        detectedBeacons: [...state.detectedBeacons, {
          ...action.payload,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
        }],
      };
    
    case actionTypes.UPDATE_BEACON:
      return {
        ...state,
        detectedBeacons: state.detectedBeacons.map(beacon =>
          beacon.deviceId === action.payload.deviceId
            ? { ...beacon, ...action.payload, lastSeen: Date.now() }
            : beacon
        ),
      };
    
    case actionTypes.REMOVE_BEACON:
      return {
        ...state,
        detectedBeacons: state.detectedBeacons.filter(
          b => b.deviceId !== action.payload
        ),
      };
    
    case actionTypes.CLEAR_BEACONS:
      return { ...state, detectedBeacons: [], selectedBeacon: null };
    
    case actionTypes.SELECT_BEACON:
      return { ...state, selectedBeacon: action.payload };
    
    case actionTypes.SET_ERROR:
      return { ...state, scanError: action.payload };
    
    case actionTypes.SET_PERMISSIONS:
      return { ...state, permissionsGranted: action.payload };
    
    default:
      return state;
  }
};

export const BluetoothProvider = ({ children }) => {
  const [state, dispatch] = useReducer(bluetoothReducer, initialState);
  const bleManagerRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const rssiHistoryRef = useRef({});
  const advertisingDataRef = useRef(null);

  useEffect(() => {
    initializeBluetooth();
    return () => {
      cleanup();
    };
  }, []);

  const initializeBluetooth = async () => {
    try {
      console.log('DEBUG: Initializing real BleManager...');
      
      bleManagerRef.current = new BleManager();
      console.log('DEBUG: BleManager instance created');
      
      const hasPermissions = await requestPermissions();
      console.log('DEBUG: Permissions result:', hasPermissions);
      
      dispatch({ type: actionTypes.SET_PERMISSIONS, payload: hasPermissions });
      
      if (!hasPermissions) {
        dispatch({
          type: actionTypes.SET_ERROR,
          payload: 'Bluetooth permissions not granted',
        });
        return;
      }
      
      // Listen for Bluetooth state changes
      const subscription = bleManagerRef.current.onStateChange((state) => {
        console.log('DEBUG: Bluetooth state changed to:', state);
        const isEnabled = state === 'PoweredOn';
        dispatch({ type: actionTypes.SET_BLUETOOTH_ENABLED, payload: isEnabled });
      }, true);
      
      console.log('DEBUG: Bluetooth initialization complete');
      return () => subscription.remove();
    } catch (error) {
      console.error('DEBUG: Bluetooth initialization error:', error);
      dispatch({
        type: actionTypes.SET_ERROR,
        payload: 'Failed to initialize Bluetooth',
      });
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;
        
        if (apiLevel >= 31) {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          return Object.values(results).every(
            result => result === PermissionsAndroid.RESULTS.GRANTED
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
    return true;
  };

  const startScanning = async (mode = 'public', groupId = null) => {
    if (!state.isBluetoothEnabled) {
      Alert.alert('Bluetooth Required', 'Please enable Bluetooth to scan for beacons.');
      return;
    }
    
    if (state.isScanning) {
      return;
    }
    
    try {
      console.log('DEBUG: Starting real BLE scan...');
      dispatch({ type: actionTypes.SET_SCANNING, payload: true });
      dispatch({ type: actionTypes.SET_ERROR, payload: null });
      
      // Real BLE scanning
      bleManagerRef.current.startDeviceScan(
        null, // Scan for all devices (filter by name later)
        { allowDuplicates: true },
        (error, device) => {
          if (error) {
            console.error('BLE Scan error:', error);
            dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
            return;
          }
          
          if (device && isFlareBeacon(device)) {
            console.log('DEBUG: Found FLARE beacon:', device.name, 'RSSI:', device.rssi);
            processBeaconDevice(device, mode, groupId);
          }
        }
      );
      
      scanIntervalRef.current = setInterval(() => {
        cleanupStaleBeacons();
      }, 5000);
      
    } catch (error) {
      console.error('Start scanning error:', error);
      dispatch({ type: actionTypes.SET_SCANNING, payload: false });
      dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
    }
  };

  const stopScanning = () => {
    try {
      if (bleManagerRef.current) {
        bleManagerRef.current.stopDeviceScan();
      }
      
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      
      dispatch({ type: actionTypes.SET_SCANNING, payload: false });
    } catch (error) {
      console.error('Stop scanning error:', error);
    }
  };

  const isFlareBeacon = (device) => {
    // Check for FLARE beacon by name
    if (device.name && device.name.startsWith('FLARE-SOS')) {
      return true;
    }
    
    // Check for iBeacon with our UUID in manufacturer data
    if (device.manufacturerData) {
      try {
        // iBeacon manufacturer data contains the UUID
        const data = device.manufacturerData;
        // Check if it contains our FLARE UUID pattern
        if (data && data.toLowerCase().includes('f1a2e3b4')) {
          return true;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Check service UUIDs
    if (device.serviceUUIDs) {
      for (const uuid of device.serviceUUIDs) {
        if (uuid.toLowerCase().includes('f1a2e3b4')) {
          return true;
        }
      }
    }
    
    return false;
  };

  const processBeaconDevice = (device, mode, groupId) => {
    try {
      const beaconData = parseBeaconData(device);
      
      if (mode === 'private' && beaconData.groupId !== groupId) {
        return;
      }
      
      if (mode === 'public' && beaconData.mode !== 'public') {
        return;
      }
      
      if (!rssiHistoryRef.current[device.id]) {
        rssiHistoryRef.current[device.id] = [];
      }
      rssiHistoryRef.current[device.id].push(device.rssi);
      if (rssiHistoryRef.current[device.id].length > 10) {
        rssiHistoryRef.current[device.id].shift();
      }
      
      const smoothedRSSI = rssiHistoryRef.current[device.id].reduce((a, b) => a + b, 0) /
        rssiHistoryRef.current[device.id].length;
      
      const distance = calculateDistanceFromRSSI(smoothedRSSI);
      
      const beacon = {
        deviceId: device.id,
        deviceName: device.name || 'Unknown Device',
        rssi: Math.round(smoothedRSSI),
        rawRssi: device.rssi,
        distance,
        ...beaconData,
      };
      
      dispatch({ type: actionTypes.ADD_BEACON, payload: beacon });
    } catch (error) {
      console.error('Process beacon error:', error);
    }
  };

  const parseBeaconData = (device) => {
    const defaultData = {
      mode: 'public',
      status: BEACON_STATUS.ACTIVE,
      batteryLevel: 100,
      message: null,
      groupId: null,
    };
    
    try {
      if (device.manufacturerData) {
        return defaultData;
      }
      
      if (device.name && device.name.startsWith('FLARE-SOS-')) {
        const parts = device.name.split('-');
        if (parts.length >= 4) {
          return {
            ...defaultData,
            mode: parts[2] || 'public',
            batteryLevel: parseInt(parts[3]) || 100,
          };
        }
      }
      
      return defaultData;
    } catch (error) {
      return defaultData;
    }
  };

  const cleanupStaleBeacons = () => {
    const now = Date.now();
    const staleThreshold = 30000;
    
    state.detectedBeacons.forEach(beacon => {
      if (now - beacon.lastSeen > staleThreshold) {
        dispatch({ type: actionTypes.REMOVE_BEACON, payload: beacon.deviceId });
        delete rssiHistoryRef.current[beacon.deviceId];
      }
    });
  };

  const selectBeacon = (beacon) => {
    dispatch({ type: actionTypes.SELECT_BEACON, payload: beacon });
  };

  const clearBeacons = () => {
    dispatch({ type: actionTypes.CLEAR_BEACONS });
    rssiHistoryRef.current = {};
  };

  const startAdvertising = async (beaconData) => {
    try {
      console.log('DEBUG: Starting real BLE beacon advertisement:', beaconData);
      
      // First, ensure we're not already advertising
      if (state.isAdvertising) {
        console.log('DEBUG: Already advertising, stopping first...');
        await stopAdvertising();
        // Add a small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Create a minimal beacon name to stay under 31 bytes
      // Format: FS-{MODE}-{BATTERY}
      const modeCode = beaconData.mode === 'private' ? 'P' : 'U';
      const battery = Math.min(99, beaconData.batteryLevel || 100); // Max 2 digits
      const beaconName = `FS-${modeCode}-${battery}`; // Only 7 chars total
      
      console.log('DEBUG: Minimal beacon name:', beaconName);
      
      // Add GATT service (but don't add characteristic to reduce data size)
      await BLEPeripheral.addService(FLARE_SERVICE_UUID, true);
      
      // Set the device name for advertising - very short
      await BLEPeripheral.setName(beaconName);
      
      // Start advertising
      await BLEPeripheral.start();
      
      console.log('DEBUG: BLE Peripheral advertising started!');
      console.log('DEBUG: Broadcasting as:', beaconName);
      
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: true });
      
      // Store beacon data locally
      advertisingDataRef.current = {
        ...beaconData,
        beaconName,
        startTime: Date.now(),
        uuid: FLARE_SERVICE_UUID,
      };
      
      return true;
    } catch (error) {
      console.error('Start advertising error:', error);
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: false });
      throw error;
    }
  };

  const stopAdvertising = async () => {
    try {
      console.log('DEBUG: Stopping BLE beacon advertisement');
      
      // Stop BLE peripheral advertising
      try {
        await BLEPeripheral.stop();
      } catch (e) {
        // Might not be advertising, ignore
        console.log('DEBUG: BLE stop error (ignoring):', e.message);
      }
      
      // Remove the service
      try {
        await BLEPeripheral.removeService(FLARE_SERVICE_UUID);
      } catch (e) {
        // Service might not exist, ignore
        console.log('DEBUG: Service removal error (ignoring):', e.message);
      }
      
      advertisingDataRef.current = null;
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: false });
      
      console.log('DEBUG: BLE advertising stopped');
    } catch (error) {
      console.error('Stop advertising error:', error);
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: false });
    }
  };

  const cleanup = () => {
    stopScanning();
    stopAdvertising();
    if (bleManagerRef.current) {
      bleManagerRef.current.destroy();
    }
  };

  const value = {
    ...state,
    startScanning,
    stopScanning,
    startAdvertising,
    stopAdvertising,
    selectBeacon,
    clearBeacons,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = () => {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetooth must be used within a BluetoothProvider');
  }
  return context;
};

export default BluetoothContext;
