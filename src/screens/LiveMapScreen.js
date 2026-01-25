/**
 * FLARE Live Map Screen
 * Sensor-based automatic navigation tracking
 * Rescuer position updates in real-time as they walk
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
import { COLORS } from '../utils/constants';

const { width } = Dimensions.get('window');
const GRID_CELL_SIZE = Math.floor((width - 40) / 7);

// Movement detection thresholds
const STEP_THRESHOLD = 1.2; // Acceleration threshold to detect a step
const STEP_COOLDOWN = 400; // Minimum ms between steps

const LiveMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [enhancedNavState, setEnhancedNavState] = useState(null);
  const [lastGuidanceMessage, setLastGuidanceMessage] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [compassHeading, setCompassHeading] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [lastStepTime, setLastStepTime] = useState(0);
  const [sensorStatus, setSensorStatus] = useState({ accelerometer: false, magnetometer: false });
  
  const positionRef = useRef({ x: 0, y: 0 });
  const accelerometerSubscription = useRef(null);
  const magnetometerSubscription = useRef(null);
  const lastAcceleration = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    // Reset navigation service when screen loads
    NavigationService.reset();
    
    // Check sensor availability
    checkSensors();
    
    return () => {
      stopTracking();
    };
  }, []);

  const checkSensors = async () => {
    try {
      const accelAvailable = await Accelerometer.isAvailableAsync();
      const magAvailable = await Magnetometer.isAvailableAsync();
      setSensorStatus({ accelerometer: accelAvailable, magnetometer: magAvailable });
    } catch (error) {
      console.log('Sensor check error:', error);
    }
  };

  // Update navigation when beacon signal changes
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
    
    // Start accelerometer for step detection
    Accelerometer.setUpdateInterval(100);
    accelerometerSubscription.current = Accelerometer.addListener(handleAccelerometer);
    
    // Start magnetometer for compass heading
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
    
    // Calculate acceleration magnitude
    const acceleration = Math.sqrt(x * x + y * y + z * z);
    const lastAccel = Math.sqrt(
      lastAcceleration.current.x ** 2 + 
      lastAcceleration.current.y ** 2 + 
      lastAcceleration.current.z ** 2
    );
    
    // Detect step based on acceleration change
    const accelChange = Math.abs(acceleration - lastAccel);
    
    if (accelChange > STEP_THRESHOLD && (now - lastStepTime) > STEP_COOLDOWN) {
      // Step detected!
      setLastStepTime(now);
      setStepCount(prev => prev + 1);
      handleStepDetected();
    }
    
    lastAcceleration.current = { x, y, z };
  };

  const handleMagnetometer = (data) => {
    const { x, y } = data;
    // Calculate heading from magnetometer
    let heading = Math.atan2(y, x) * (180 / Math.PI);
    if (heading < 0) heading += 360;
    setCompassHeading(Math.round(heading));
  };

  const handleStepDetected = () => {
    // Convert compass heading to grid direction
    const direction = headingToDirection(compassHeading);
    
    // Update position based on direction
    const newX = positionRef.current.x + direction.dx;
    const newY = positionRef.current.y + direction.dy;
    positionRef.current = { x: newX, y: newY };
    setCurrentPosition({ x: newX, y: newY });

    // Record movement with signal reading
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        const guidance = NavigationService.recordMovement(
          direction,
          { x: newX, y: newY },
          beacon.rssi
        );
        
        if (guidance) {
          const fullState = NavigationService.getFullNavigationState();
          setEnhancedNavState(fullState);
          
          // Vibration feedback
          if (guidance.hotColdState === 'getting_warmer' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate(100);
          } else if (guidance.hotColdState === 'getting_colder' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate([0, 50, 50, 50]);
          }
          
          setLastGuidanceMessage(guidance.message);
        }
      }
    }
  };

  const headingToDirection = (heading) => {
    // Convert compass heading to 8-direction movement
    // North = 0°, East = 90°, South = 180°, West = 270°
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

  const handleReset = () => {
    Alert.alert(
      'Reset Map?',
      'This will clear all recorded navigation data and stop tracking.',
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

  const renderNavigationInfo = () => {
    if (!selectedBeacon) {
      return (
        <View style={styles.navInfo}>
          <Text style={styles.warningText}>⚠️ No beacon selected - go back and select a victim</Text>
        </View>
      );
    }

    const guidance = enhancedNavState?.guidance;

    return (
      <View style={[styles.navInfo, { backgroundColor: getHotColdColor() }]}>
        <View style={styles.navDistance}>
          <Text style={styles.navDistanceValue}>
            {guidance?.distance || '--'}
          </Text>
          <Text style={styles.navDistanceLabel}>to victim</Text>
        </View>
        
        {enhancedNavState?.rssi && (
          <SignalStrength rssi={enhancedNavState.rssi} size="small" />
        )}
        
        <View style={styles.navGuidance}>
          <Icon
            name={guidance?.icon || 'compass'}
            size={24}
            color={guidance?.confidence > 0.5 ? COLORS.secondary : COLORS.warning}
          />
          <Text style={styles.navGuidanceText} numberOfLines={3}>
            {guidance?.message || 'Start walking to track movement...'}
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
        borderColor = COLORS.secondary;
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
        return <Icon name="walk" size={GRID_CELL_SIZE * 0.5} color={COLORS.text} />;
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

  const renderTrackingStatus = () => (
    <View style={styles.trackingStatus}>
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Icon 
            name="compass" 
            size={20} 
            color={sensorStatus.magnetometer ? COLORS.secondary : COLORS.danger} 
          />
          <Text style={styles.statusText}>
            {getCompassDirection(compassHeading)} ({compassHeading}°)
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Icon 
            name="shoe-print" 
            size={20} 
            color={COLORS.text} 
          />
          <Text style={styles.statusText}>{stepCount} steps</Text>
        </View>
      </View>
      
      <View style={styles.positionDisplay}>
        <Text style={styles.positionText}>
          Position: ({currentPosition.x}, {currentPosition.y})
        </Text>
      </View>
    </View>
  );

  const renderControls = () => (
    <View style={styles.controls}>
      <TouchableOpacity 
        style={[styles.trackButton, isTracking && styles.trackButtonActive]}
        onPress={isTracking ? stopTracking : startTracking}
      >
        <Icon 
          name={isTracking ? 'stop' : 'play'} 
          size={24} 
          color={COLORS.text} 
        />
        <Text style={styles.trackButtonText}>
          {isTracking ? 'Stop Tracking' : 'Start Tracking'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Icon name="refresh" size={20} color={COLORS.text} />
        <Text style={styles.resetButtonText}>Reset</Text>
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
        <Text style={styles.title}>🚶 Live Map</Text>
        <Text style={styles.subtitle}>Walk around - map updates automatically</Text>
      </View>

      {renderNavigationInfo()}
      {renderTrackingStatus()}

      <View style={styles.mapContainer}>
        {renderGrid()}
        
        {!isTracking && (
          <View style={styles.overlayMessage}>
            <Icon name="play-circle" size={40} color={COLORS.text} />
            <Text style={styles.overlayText}>Press "Start Tracking" to begin</Text>
          </View>
        )}
      </View>

      {renderLegend()}
      {renderControls()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 15,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  navInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: COLORS.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 12,
  },
  warningText: {
    color: COLORS.warning,
    fontSize: 14,
    textAlign: 'center',
    flex: 1,
  },
  navDistance: {
    alignItems: 'center',
    minWidth: 70,
  },
  navDistanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  navDistanceLabel: {
    fontSize: 11,
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
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  trackingStatus: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    padding: 10,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 14,
  },
  positionDisplay: {
    alignItems: 'center',
    marginTop: 8,
  },
  positionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
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
  overlayMessage: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  overlayText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: COLORS.surface,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 15,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: COLORS.secondary,
    gap: 10,
  },
  trackButtonActive: {
    backgroundColor: COLORS.danger,
  },
  trackButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  resetButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
});

export default LiveMapScreen;
