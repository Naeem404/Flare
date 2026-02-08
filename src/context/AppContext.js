/**
 * FLARE App Context
 * Global state management for the application
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { BEACON_MODES, BEACON_STATUS } from '../utils/constants';

const AppContext = createContext();

const initialState = {
  deviceId: null,
  userId: null,
  userRole: 'civilian',
  isVerifiedRescuer: false,
  
  currentMode: null,
  activeBeacon: null,
  isBeaconActive: false,
  
  privateGroups: [],
  currentGroup: null,
  
  settings: {
    environmentFactor: 2.5,
    stepLength: 65,
    soundEnabled: true,
    vibrationEnabled: true,
    autoSync: true,
    highAccuracyMode: false,
  },
  
  isLoading: false,
  error: null,
};

const actionTypes = {
  SET_DEVICE_ID: 'SET_DEVICE_ID',
  SET_USER: 'SET_USER',
  SET_MODE: 'SET_MODE',
  SET_BEACON: 'SET_BEACON',
  CLEAR_BEACON: 'CLEAR_BEACON',
  SET_GROUPS: 'SET_GROUPS',
  ADD_GROUP: 'ADD_GROUP',
  REMOVE_GROUP: 'REMOVE_GROUP',
  SET_CURRENT_GROUP: 'SET_CURRENT_GROUP',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

const appReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_DEVICE_ID:
      return { ...state, deviceId: action.payload };
    
    case actionTypes.SET_USER:
      return {
        ...state,
        userId: action.payload.id,
        userRole: action.payload.role,
        isVerifiedRescuer: action.payload.isVerifiedRescuer,
      };
    
    case actionTypes.SET_MODE:
      return { ...state, currentMode: action.payload };
    
    case actionTypes.SET_BEACON:
      return {
        ...state,
        activeBeacon: action.payload,
        isBeaconActive: true,
      };
    
    case actionTypes.CLEAR_BEACON:
      return {
        ...state,
        activeBeacon: null,
        isBeaconActive: false,
      };
    
    case actionTypes.SET_GROUPS:
      return { ...state, privateGroups: action.payload };
    
    case actionTypes.ADD_GROUP:
      return {
        ...state,
        privateGroups: [...state.privateGroups, action.payload],
      };
    
    case actionTypes.REMOVE_GROUP:
      return {
        ...state,
        privateGroups: state.privateGroups.filter(g => g.id !== action.payload),
      };
    
    case actionTypes.SET_CURRENT_GROUP:
      return { ...state, currentGroup: action.payload };
    
    case actionTypes.UPDATE_SETTINGS:
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    
    case actionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    
    case actionTypes.SET_ERROR:
      return { ...state, error: action.payload, isLoading: false };
    
    case actionTypes.CLEAR_ERROR:
      return { ...state, error: null };
    
    default:
      return state;
  }
};

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      dispatch({ type: actionTypes.SET_LOADING, payload: true });
      
      const deviceId = Constants.installationId || Device.osBuildId || `device_${Date.now()}`;
      dispatch({ type: actionTypes.SET_DEVICE_ID, payload: deviceId });
      
      const savedSettings = await AsyncStorage.getItem('flare_settings');
      if (savedSettings) {
        dispatch({
          type: actionTypes.UPDATE_SETTINGS,
          payload: JSON.parse(savedSettings),
        });
      }
      
      const savedGroups = await AsyncStorage.getItem('flare_groups');
      if (savedGroups) {
        dispatch({
          type: actionTypes.SET_GROUPS,
          payload: JSON.parse(savedGroups),
        });
      }
      
      const savedUser = await AsyncStorage.getItem('flare_user');
      if (savedUser) {
        dispatch({
          type: actionTypes.SET_USER,
          payload: JSON.parse(savedUser),
        });
      }
      
      dispatch({ type: actionTypes.SET_LOADING, payload: false });
    } catch (error) {
      console.error('App initialization error:', error);
      dispatch({
        type: actionTypes.SET_ERROR,
        payload: 'Failed to initialize app',
      });
    }
  };

  const setMode = (mode) => {
    dispatch({ type: actionTypes.SET_MODE, payload: mode });
  };

  const activateBeacon = async (beaconData) => {
    try {
      const beacon = {
        id: `beacon_${Date.now()}`,
        deviceId: state.deviceId,
        status: BEACON_STATUS.ACTIVE,
        createdAt: new Date().toISOString(),
        ...beaconData,
      };
      
      dispatch({ type: actionTypes.SET_BEACON, payload: beacon });
      await AsyncStorage.setItem('flare_active_beacon', JSON.stringify(beacon));
      
      return beacon;
    } catch (error) {
      console.error('Beacon activation error:', error);
      dispatch({
        type: actionTypes.SET_ERROR,
        payload: 'Failed to activate beacon',
      });
      throw error;
    }
  };

  const deactivateBeacon = async () => {
    try {
      dispatch({ type: actionTypes.CLEAR_BEACON });
      await AsyncStorage.removeItem('flare_active_beacon');
    } catch (error) {
      console.error('Beacon deactivation error:', error);
    }
  };

  const joinGroup = async (groupData) => {
    try {
      dispatch({ type: actionTypes.ADD_GROUP, payload: groupData });
      
      const updatedGroups = [...state.privateGroups, groupData];
      await AsyncStorage.setItem('flare_groups', JSON.stringify(updatedGroups));
      
      return groupData;
    } catch (error) {
      console.error('Join group error:', error);
      dispatch({
        type: actionTypes.SET_ERROR,
        payload: 'Failed to join group',
      });
      throw error;
    }
  };

  const leaveGroup = async (groupId) => {
    try {
      dispatch({ type: actionTypes.REMOVE_GROUP, payload: groupId });
      
      const updatedGroups = state.privateGroups.filter(g => g.id !== groupId);
      await AsyncStorage.setItem('flare_groups', JSON.stringify(updatedGroups));
    } catch (error) {
      console.error('Leave group error:', error);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      dispatch({ type: actionTypes.UPDATE_SETTINGS, payload: newSettings });
      
      const updatedSettings = { ...state.settings, ...newSettings };
      await AsyncStorage.setItem('flare_settings', JSON.stringify(updatedSettings));
    } catch (error) {
      console.error('Settings update error:', error);
    }
  };

  const clearError = () => {
    dispatch({ type: actionTypes.CLEAR_ERROR });
  };

  const value = {
    ...state,
    setMode,
    activateBeacon,
    deactivateBeacon,
    joinGroup,
    leaveGroup,
    updateSettings,
    clearError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
