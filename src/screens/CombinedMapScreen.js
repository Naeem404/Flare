/**
 * FLARE Combined Map Screen
 * Toggle between Manual and Live navigation modes
 * Shared map data between both modes
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Vibration,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import NavigationService from '../services/NavigationService';
import SignalStrength from '../components/SignalStrength';
import { COLORS, RSSI_CONFIG } from '../utils/constants';

const { width } = Dimensions.get('window');
const GRID_CELL_SIZE = Math.floor((width - 40) / 7);

const STEP_THRESHOLD = 1.2;
const STEP_COOLDOWN = 400;

const CombinedMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  
  // Mode: 'manual' or 'live'
  const [mode, setMode] = useState('manual');
  
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [enhancedNavState, setEnhancedNavState] = useState(null);
  const [lastGuidanceMessage, setLastGuidanceMessage] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [compassHeading, setCompassHeading] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [lastStepTime, setLastStepTime] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  
  const positionRef = useRef({ x: 0, y: 0 });
  const accelerometerSubscription = useRef(null);
  const magnetometerSubscription = useRef(null);
  const lastAcceleration = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    NavigationService.reset();
    return () => {
      stopTracking();
    };
  }, []);

  // Stop tracking when switching to manual mode
  useEffect(() => {
    if (mode === 'manual' && isTracking) {
      stopTracking();
    }
  }, [mode]);

  useEffect(() => {
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        NavigationService.processRSSIReading(beacon.rssi, currentPosition);
        const fullState = NavigationService.getFullNavigationState();
        setEnhancedNavState(fullState);
      }
    }
  }, [selectedBeacon, detectedBeacons, currentPosition]);

  const startTracking = () => {
    setIsTracking(true);
    Accelerometer.setUpdateInterval(100);
    accelerometerSubscription.current = Accelerometer.addListener(handleAccelerometer);
    Magnetometer.setUpdateInterval(200);
    magnetometerSubscription.current = Magnetometer.addListener(handleMagnetometer);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (accelerometerSubscription.current) {
      accelerometerSubscription.current.remove();
      accelerometerSubscription.current = null;
    }
    if (magnetometerSubscription.current) {
      magnetometerSubscription.current.remove();
      magnetometerSubscription.current = null;
    }
  };

  const handleAccelerometer = (data) => {
    const { x, y, z } = data;
    const now = Date.now();
    
    const acceleration = Math.sqrt(x * x + y * y + z * z);
    const lastAccel = Math.sqrt(
      lastAcceleration.current.x ** 2 + 
      lastAcceleration.current.y ** 2 + 
      lastAcceleration.current.z ** 2
    );
    
    const accelChange = Math.abs(acceleration - lastAccel);
    
    if (accelChange > STEP_THRESHOLD && (now - lastStepTime) > STEP_COOLDOWN) {
      setLastStepTime(now);
      setStepCount(prev => prev + 1);
      handleStepDetected();
    }
    
    lastAcceleration.current = { x, y, z };
  };

  const handleMagnetometer = (data) => {
    const { x, y } = data;
    let heading = Math.atan2(y, x) * (180 / Math.PI);
    if (heading < 0) heading += 360;
    setCompassHeading(Math.round(heading));
  };

  const handleStepDetected = () => {
    const direction = headingToDirection(compassHeading);
    updatePosition(direction.dx, direction.dy);
  };

  const headingToDirection = (heading) => {
    if (heading >= 337.5 || heading < 22.5) return { dx: 0, dy: -1, name: 'N' };
    if (heading >= 22.5 && heading < 67.5) return { dx: 1, dy: -1, name: 'NE' };
    if (heading >= 67.5 && heading < 112.5) return { dx: 1, dy: 0, name: 'E' };
    if (heading >= 112.5 && heading < 157.5) return { dx: 1, dy: 1, name: 'SE' };
    if (heading >= 157.5 && heading < 202.5) return { dx: 0, dy: 1, name: 'S' };
    if (heading >= 202.5 && heading < 247.5) return { dx: -1, dy: 1, name: 'SW' };
    if (heading >= 247.5 && heading < 292.5) return { dx: -1, dy: 0, name: 'W' };
    if (heading >= 292.5 && heading < 337.5) return { dx: -1, dy: -1, name: 'NW' };
    return { dx: 0, dy: -1, name: 'N' };
  };

  const getCompassDirection = (heading) => {
    if (heading >= 337.5 || heading < 22.5) return 'N';
    if (heading >= 22.5 && heading < 67.5) return 'NE';
    if (heading >= 67.5 && heading < 112.5) return 'E';
    if (heading >= 112.5 && heading < 157.5) return 'SE';
    if (heading >= 157.5 && heading < 202.5) return 'S';
    if (heading >= 202.5 && heading < 247.5) return 'SW';
    if (heading >= 247.5 && heading < 292.5) return 'W';
    if (heading >= 292.5 && heading < 337.5) return 'NW';
    return 'N';
  };

  const updatePosition = useCallback((dx, dy) => {
    const newX = positionRef.current.x + dx;
    const newY = positionRef.current.y + dy;
    positionRef.current = { x: newX, y: newY };
    setCurrentPosition({ x: newX, y: newY });
    setMoveCount(prev => prev + 1);

    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        const guidance = NavigationService.recordMovement(
          { dx: Math.sign(dx), dy: Math.sign(dy) },
          { x: newX, y: newY },
          beacon.rssi
        );
        
        if (guidance) {
          const fullState = NavigationService.getFullNavigationState();
          setEnhancedNavState(fullState);
          
          if (guidance.hotColdState === 'getting_warmer' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate(100);
          } else if (guidance.hotColdState === 'getting_colder' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate([0, 50, 50, 50]);
          }
          
          setLastGuidanceMessage(guidance.message);
        }
      }
    }
  }, [selectedBeacon, detectedBeacons, lastGuidanceMessage]);

  const handleReset = () => {
    Alert.alert(
      'Reset Map?',
      'This will clear all recorded navigation data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            stopTracking();
            NavigationService.reset();
            positionRef.current = { x: 0, y: 0 };
            setCurrentPosition({ x: 0, y: 0 });
            setEnhancedNavState(null);
            setStepCount(0);
            setMoveCount(0);
          },
        },
      ]
    );
  };

  const getHotColdColor = () => {
    const guidance = enhancedNavState?.guidance;
    if (!guidance) return COLORS.surface;
    switch (guidance.hotColdState) {
      case 'getting_warmer': return 'rgba(255, 87, 34, 0.3)';
      case 'getting_colder': return 'rgba(33, 150, 243, 0.3)';
      case 'stable': return 'rgba(255, 193, 7, 0.2)';
      default: return COLORS.surface;
    }
  };

  const renderModeToggle = () => (
    <View style={styles.modeToggle}>
      <TouchableOpacity
        style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
        onPress={() => setMode('manual')}
      >
        <Icon name="gesture-tap" size={20} color={mode === 'manual' ? COLORS.text : COLORS.textSecondary} />
        <Text style={[styles.modeButtonText, mode === 'manual' && styles.modeButtonTextActive]}>
          Manual
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modeButton, mode === 'live' && styles.modeButtonActive]}
        onPress={() => setMode('live')}
      >
        <Icon name="walk" size={20} color={mode === 'live' ? COLORS.text : COLORS.textSecondary} />
        <Text style={[styles.modeButtonText, mode === 'live' && styles.modeButtonTextActive]}>
          Live
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderNavigationInfo = () => {
    if (!selectedBeacon) {
      return (
        <View style={styles.navInfo}>
          <Text style={styles.warningText}>⚠️ No beacon selected</Text>
        </View>
      );
    }

    const guidance = enhancedNavState?.guidance;

    return (
      <View style={[styles.navInfo, { backgroundColor: getHotColdColor() }]}>
        <View style={styles.navDistance}>
          <Text style={styles.navDistanceValue}>{guidance?.distance || '--'}</Text>
          <Text style={styles.navDistanceLabel}>to victim</Text>
        </View>
        
        {enhancedNavState?.rssi && (
          <SignalStrength rssi={enhancedNavState.rssi} size="small" />
        )}
        
        <View style={styles.navGuidance}>
          <Icon
            name={guidance?.icon || 'compass'}
            size={24}
            color={guidance?.confidence > 0.5 ? COLORS.info : COLORS.warning}
          />
          <Text style={styles.navGuidanceText} numberOfLines={3}>
            {guidance?.message || 'Move to start navigation...'}
          </Text>
        </View>
      </View>
    );
  };

  const renderGrid = () => {
    const grid = enhancedNavState?.grid || [];
    
    const displayGrid = grid.length > 0 ? grid : Array(7).fill(null).map((_, y) => 
      Array(7).fill(null).map((_, x) => ({
        x: x - 3,
        y: y - 3,
        status: 'unknown',
        isRescuer: x === 3 && y === 3,
      }))
    );

    const getCellStyle = (cell) => {
      let backgroundColor = COLORS.heatMapUnknown;
      let borderColor = COLORS.border;
      
      if (cell.isRescuer) {
        backgroundColor = COLORS.info;
        borderColor = COLORS.info;
      } else if (cell.isEstimatedVictim) {
        backgroundColor = COLORS.primary;
        borderColor = COLORS.primary;
      } else if (cell.isObstacle || cell.status === 'obstacle') {
        backgroundColor = COLORS.heatMapObstacle;
        borderColor = COLORS.danger;
      } else if (cell.isBestPath || cell.status === 'clear') {
        backgroundColor = COLORS.heatMapClear;
        borderColor = COLORS.info;
      } else if (cell.status === 'unstable' || cell.status === 'weak') {
        backgroundColor = COLORS.heatMapUnstable;
      }
      
      return {
        width: GRID_CELL_SIZE,
        height: GRID_CELL_SIZE,
        backgroundColor,
        borderWidth: cell.isBestPath ? 2 : 1,
        borderColor,
        justifyContent: 'center',
        alignItems: 'center',
      };
    };

    const getCellIcon = (cell) => {
      if (cell.isRescuer) {
        return <Icon name={mode === 'live' ? 'walk' : 'account'} size={GRID_CELL_SIZE * 0.5} color={COLORS.text} />;
      }
      if (cell.isEstimatedVictim) {
        return <Icon name="map-marker-alert" size={GRID_CELL_SIZE * 0.5} color={COLORS.text} />;
      }
      if (cell.isObstacle || cell.status === 'obstacle') {
        return <Icon name="close-thick" size={GRID_CELL_SIZE * 0.4} color={COLORS.text} />;
      }
      if (cell.isBestPath) {
        return <Icon name="arrow-up-bold" size={GRID_CELL_SIZE * 0.4} color={COLORS.text} />;
      }
      return null;
    };

    return (
      <View style={styles.gridContainer}>
        {displayGrid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((cell, colIndex) => (
              <View key={`${rowIndex}-${colIndex}`} style={getCellStyle(cell)}>
                {getCellIcon(cell)}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderManualControls = () => (
    <View style={styles.manualControls}>
      <View style={styles.movementPad}>
        <TouchableOpacity style={styles.moveButton} onPress={() => updatePosition(0, -1)}>
          <Icon name="arrow-up" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.moveRow}>
          <TouchableOpacity style={styles.moveButton} onPress={() => updatePosition(-1, 0)}>
            <Icon name="arrow-left" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.centerIndicator}>
            <Text style={styles.moveCountText}>{moveCount}</Text>
          </View>
          <TouchableOpacity style={styles.moveButton} onPress={() => updatePosition(1, 0)}>
            <Icon name="arrow-right" size={28} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.moveButton} onPress={() => updatePosition(0, 1)}>
          <Icon name="arrow-down" size={28} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLiveControls = () => (
    <View style={styles.liveControls}>
      <View style={styles.liveStatus}>
        <View style={styles.statusItem}>
          <Icon name="compass" size={18} color={COLORS.info} />
          <Text style={styles.statusText}>{getCompassDirection(compassHeading)} ({compassHeading}°)</Text>
        </View>
        <View style={styles.statusItem}>
          <Icon name="shoe-print" size={18} color={COLORS.text} />
          <Text style={styles.statusText}>{stepCount} steps</Text>
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.trackButton, isTracking && styles.trackButtonActive]}
        onPress={isTracking ? stopTracking : startTracking}
      >
        <Icon name={isTracking ? 'stop' : 'play'} size={22} color={COLORS.text} />
        <Text style={styles.trackButtonText}>
          {isTracking ? 'Stop' : 'Start'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderLegend = () => (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.info }]} />
        <Text style={styles.legendText}>You</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.primary }]} />
        <Text style={styles.legendText}>Victim</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapClear }]} />
        <Text style={styles.legendText}>Clear</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapObstacle }]} />
        <Text style={styles.legendText}>Blocked</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Combined Map</Text>
        <Text style={styles.subtitle}>Switch between Manual & Live modes</Text>
      </View>

      {renderModeToggle()}
      {renderNavigationInfo()}

      <View style={styles.mapContainer}>
        {renderGrid()}
        
        <View style={styles.positionBadge}>
          <Text style={styles.positionText}>({currentPosition.x}, {currentPosition.y})</Text>
        </View>
      </View>

      {renderLegend()}
      
      {mode === 'manual' ? renderManualControls() : renderLiveControls()}
      
      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Icon name="refresh" size={18} color={COLORS.text} />
        <Text style={styles.resetButtonText}>Reset Map</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: COLORS.primary,
  },
  modeButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: COLORS.textPrimary,
  },
  navInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  warningText: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  navDistance: {
    alignItems: 'center',
    minWidth: 60,
  },
  navDistanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  navDistanceLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  navGuidance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginLeft: 10,
  },
  navGuidanceText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textPrimary,
    lineHeight: 16,
  },
  mapContainer: {
    flex: 1,
    margin: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    padding: 10,
  },
  gridRow: {
    flexDirection: 'row',
  },
  positionBadge: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  positionText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  manualControls: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  movementPad: {
    alignItems: 'center',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moveButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  centerIndicator: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 24,
  },
  moveCountText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  liveControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  liveStatus: {
    gap: 6,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.info,
    gap: 8,
  },
  trackButtonActive: {
    backgroundColor: COLORS.danger,
  },
  trackButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  resetButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 13,
  },
});

export default CombinedMapScreen;
