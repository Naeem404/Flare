/**
 * FLARE Bluetooth Context
 * Manages Bluetooth LE scanning and advertising for beacon communication
 */

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { BLUETOOTH_CONFIG, BEACON_STATUS } from '../utils/constants';
import { calculateDistanceFromRSSI, smoothRSSI } from '../utils/rssiCalculator';

// Use mock service for Expo Go compatibility
// Note: react-native-ble-plx requires native modules not available in Expo Go
// Using mock implementation for Expo Go compatibility
const BleManager = class MockBleManager {
  constructor() {
    console.log('DEBUG: Using Mock BleManager for Expo Go compatibility');
  }
  onStateChange(callback, immediate = false) {
    console.log('DEBUG: Mock onStateChange called');
    if (immediate && callback) callback('PoweredOn');
    return { remove: () => {} };
  }
  startDeviceScan(serviceUUIDs, options, callback) {
    console.log('DEBUG: Mock: Starting device scan');
    // Simulate finding a mock beacon after 3 seconds
    setTimeout(() => {
      if (callback) {
        const mockDevice = {
          id: 'mock-beacon-123',
          name: 'FLARE-SOS-PUBLIC-95',
          rssi: -65,
          serviceUUIDs: ['0000180f-0000-1000-8000-00805f9b34fb'],
          manufacturerData: null,
        };
        callback(null, mockDevice);
      }
    }, 3000);
  }
  stopDeviceScan() {
    console.log('DEBUG: Mock: Stopping device scan');
  }
  destroy() {
    console.log('DEBUG: Mock: BleManager destroyed');
  }
};

console.log('DEBUG: Mock BleManager ready for Expo Go');

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

  useEffect(() => {
    initializeBluetooth();
    return () => {
      cleanup();
    };
  }, []);

  const initializeBluetooth = async () => {
    try {
      console.log('DEBUG: Initializing Bluetooth...');
      console.log('DEBUG: BleManager before instantiation:', BleManager);
      
      bleManagerRef.current = new BleManager();
      console.log('DEBUG: BleManager instance created:', bleManagerRef.current);
      
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
      
      console.log('DEBUG: Setting up state change listener...');
      const subscription = bleManagerRef.current.onStateChange((state) => {
        console.log('DEBUG: Bluetooth state changed to:', state);
        const isEnabled = state === 'PoweredOn';
        dispatch({ type: actionTypes.SET_BLUETOOTH_ENABLED, payload: isEnabled });
      }, true);
      
      console.log('DEBUG: Bluetooth initialization complete');
      return () => subscription.remove();
    } catch (error) {
      console.error('DEBUG: Bluetooth initialization error:', error);
      console.error('DEBUG: Error stack:', error.stack);
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
      dispatch({ type: actionTypes.SET_SCANNING, payload: true });
      dispatch({ type: actionTypes.SET_ERROR, payload: null });
      
      // Use mock implementation for Expo Go
      bleManagerRef.current.startDeviceScan(
        null,
        { allowDuplicates: true },
        (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            dispatch({ type: actionTypes.SET_ERROR, payload: error.message });
            return;
          }
          
          if (device && isFlareBeacon(device)) {
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
    if (device.name && device.name.startsWith('FLARE-SOS')) {
      return true;
    }
    
    if (device.manufacturerData) {
      const data = device.manufacturerData;
      if (data && data.includes('FLARE')) {
        return true;
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
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: true });
      
      console.log('Starting beacon advertisement:', beaconData);
      
      return true;
    } catch (error) {
      console.error('Start advertising error:', error);
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: false });
      throw error;
    }
  };

  const stopAdvertising = () => {
    try {
      dispatch({ type: actionTypes.SET_ADVERTISING, payload: false });
    } catch (error) {
      console.error('Stop advertising error:', error);
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
