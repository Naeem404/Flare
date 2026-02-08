/**
 * FLARE Radar Map Screen
 * Circular scrolling map with real-time movement tracking
 * Grid covers 10 meters radius, each circle = 50cm
 * Map scrolls as rescuer moves, giving visual feedback of movement
 * Includes calibration for accurate direction finding
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
  Vibration,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { Accelerometer, Magnetometer } from 'expo-sensors';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import { COLORS, RSSI_CONFIG, BLUETOOTH_CONFIG } from '../utils/constants';
import { trilateratePosition } from '../utils/rssiCalculator';

const { width, height } = Dimensions.get('window');

// Grid configuration - 10 meter radius coverage
// 20x20 grid, each circle = 50cm, total = 10m x 10m (5m radius from center)
const GRID_SIZE = 20;
const CM_PER_CIRCLE = 50; // Each circle represents 50cm
const VISIBLE_RADIUS_CM = (GRID_SIZE / 2) * CM_PER_CIRCLE; // 500cm = 5m radius, 10m diameter
const CIRCLE_SIZE = Math.floor((width - 40) / GRID_SIZE);
const CIRCLE_MARGIN = 1;

// Movement detection - faster response
const STEP_THRESHOLD = 1.1;
const STEP_COOLDOWN = 250;
// STEP_DISTANCE_CM moved below to use from context/settings

// Sensor update intervals - faster for less delay
const ACCEL_UPDATE_INTERVAL = 50;
const MAG_UPDATE_INTERVAL = 60;

// Distance estimation constants - moved below to use from context/settings

// Calibration constants - rotation-based, not time-based
const MIN_DIRECTIONS_REQUIRED = 6; // Must sample at least 6 of 8 compass directions
const ALL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const RadarMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons } = useBluetooth();

  // Load settings with defaults
  const txPower = RSSI_CONFIG.TX_POWER;
  const environmentFactor = settings?.environmentFactor || RSSI_CONFIG.ENVIRONMENT_FACTORS.INDOOR_LIGHT;
  const stepDistanceCm = settings?.stepLength || 65; // Default 65cm if not set

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showCalibrationPrompt, setShowCalibrationPrompt] = useState(true);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationData, setCalibrationData] = useState({});
  const [calibratedDirection, setCalibratedDirection] = useState(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [directionsVisited, setDirectionsVisited] = useState(new Set());

  // Position state - rescuer is always at center, world moves around them
  const [worldOffset, setWorldOffset] = useState({ x: 0, y: 0 });
  const [heading, setHeading] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [lastStepTime, setLastStepTime] = useState(0);

  // Victim tracking
  const [victimDirection, setVictimDirection] = useState(null);
  const [victimAngle, setVictimAngle] = useState(0); // Precise angle in degrees
  const [victimDistance, setVictimDistance] = useState(null);
  const [victimOnMap, setVictimOnMap] = useState(false);
  const [victimMapPosition, setVictimMapPosition] = useState(null);

  // Signal tracking
  const [rssiHistory, setRssiHistory] = useState([]);
  const [directionConfidence, setDirectionConfidence] = useState(0);

  // Refs
  const accelerometerSub = useRef(null);
  const magnetometerSub = useRef(null);
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const previousRssi = useRef(null);
  const movementDirectionRef = useRef({ dx: 0, dy: -1 });
  const calibrationStartTime = useRef(null);
  const calibrationInterval = useRef(null);
  const rssiSamplesRef = useRef(new Map()); // Store RSSI samples for trilateration: beaconId -> [{x, y, rssi, timestamp}, ...]
  
  // Animation for smooth scrolling effect
  const scrollAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // Run self-tests on mount
  useEffect(() => {
    runSelfTests();
  }, []);

  const runSelfTests = () => {
    console.log('=== RADAR MAP SELF-TESTS ===');
    
    // Test 1: Grid configuration
    console.log('TEST 1: Grid Configuration');
    console.log(`  Grid size: ${GRID_SIZE}x${GRID_SIZE}`);
    console.log(`  CM per circle: ${CM_PER_CIRCLE}cm`);
    console.log(`  Visible radius: ${VISIBLE_RADIUS_CM}cm (${VISIBLE_RADIUS_CM/100}m)`);
    console.log(`  Total coverage: ${VISIBLE_RADIUS_CM * 2}cm diameter (${VISIBLE_RADIUS_CM * 2 / 100}m)`);
    const gridTest = GRID_SIZE === 20 && CM_PER_CIRCLE === 50 && VISIBLE_RADIUS_CM === 500;
    console.log(`  RESULT: ${gridTest ? '✓ PASS' : '✗ FAIL'}`);
    
    // Test 2: Distance calculation
    console.log('TEST 2: Distance Calculation');
    const testRssi = -59;
    const testDist = Math.pow(10, (txPower - testRssi) / (10 * environmentFactor));
    console.log(`  RSSI ${testRssi} → ${(testDist * 100).toFixed(0)}cm (txPower: ${txPower}, envFactor: ${environmentFactor})`);
    const distTest = testDist > 0.9 && testDist < 1.1; // Should be ~1m
    console.log(`  RESULT: ${distTest ? '✓ PASS' : '✗ FAIL'}`);
    
    // Test 3: Heading quadrant
    console.log('TEST 3: Heading Quadrant Detection');
    const testHeadings = [0, 45, 90, 135, 180, 225, 270, 315];
    const expectedDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let headingTestPass = true;
    testHeadings.forEach((h, i) => {
      const dir = getHeadingQuadrant(h);
      const pass = dir === expectedDirs[i];
      if (!pass) headingTestPass = false;
      console.log(`  ${h}° → ${dir} ${pass ? '✓' : '✗'}`);
    });
    console.log(`  RESULT: ${headingTestPass ? '✓ PASS' : '✗ FAIL'}`);
    
    // Test 4: Angle from direction
    console.log('TEST 4: Angle from Direction');
    const angleN = getAngleFromDirection('N');
    const angleE = getAngleFromDirection('E');
    const angleS = getAngleFromDirection('S');
    const angleTest = angleN === 0 && angleE === 90 && angleS === 180;
    console.log(`  N→${angleN}°, E→${angleE}°, S→${angleS}°`);
    console.log(`  RESULT: ${angleTest ? '✓ PASS' : '✗ FAIL'}`);
    
    // Test 5: Rotation-based calibration config
    console.log('TEST 5: Rotation-Based Calibration');
    console.log(`  Min directions required: ${MIN_DIRECTIONS_REQUIRED}`);
    console.log(`  All directions: ${ALL_DIRECTIONS.join(', ')}`);
    const calibTest = MIN_DIRECTIONS_REQUIRED === 6 && ALL_DIRECTIONS.length === 8;
    console.log(`  RESULT: ${calibTest ? '✓ PASS' : '✗ FAIL'}`);
    
    // Test 6: Calibration completion logic
    console.log('TEST 6: Calibration Completion Logic');
    const testVisited = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW']);
    const shouldComplete = testVisited.size >= MIN_DIRECTIONS_REQUIRED;
    const testVisitedPartial = new Set(['N', 'NE', 'E']);
    const shouldNotComplete = testVisitedPartial.size >= MIN_DIRECTIONS_REQUIRED;
    const completionTest = shouldComplete === true && shouldNotComplete === false;
    console.log(`  6 dirs visited → complete: ${shouldComplete} ${shouldComplete ? '✓' : '✗'}`);
    console.log(`  3 dirs visited → complete: ${shouldNotComplete} ${!shouldNotComplete ? '✓' : '✗'}`);
    console.log(`  RESULT: ${completionTest ? '✓ PASS' : '✗ FAIL'}`);
    
    // Summary
    const allPass = gridTest && distTest && headingTestPass && angleTest && calibTest && completionTest;
    console.log('=== SELF-TEST SUMMARY ===');
    console.log(`  All tests: ${allPass ? '✓ ALL PASSED' : '✗ SOME FAILED'}`);
    console.log('===========================');
  };

  // Start tracking on mount
  useEffect(() => {
    console.log('DEBUG RadarMap: Screen mounted');
    startSensors();
    return () => {
      console.log('DEBUG RadarMap: Screen unmounting');
      stopSensors();
      if (calibrationInterval.current) {
        clearInterval(calibrationInterval.current);
      }
    };
  }, []);

  // Process beacon signal
  useEffect(() => {
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        console.log('DEBUG RadarMap: Beacon RSSI:', beacon.rssi);
        processBeaconSignal(beacon.rssi);
        
        // If calibrating, record this reading
        if (isCalibrating) {
          recordCalibrationSample(beacon.rssi);
        }
      }
    }
  }, [selectedBeacon, detectedBeacons, isCalibrating]);

  const startSensors = async () => {
    console.log('DEBUG RadarMap: Starting sensors...');
    
    try {
      const accelAvailable = await Accelerometer.isAvailableAsync();
      const magAvailable = await Magnetometer.isAvailableAsync();
      console.log('DEBUG RadarMap: Sensors available:', { accel: accelAvailable, mag: magAvailable });
      
      // Accelerometer for step detection - faster updates
      Accelerometer.setUpdateInterval(ACCEL_UPDATE_INTERVAL);
      accelerometerSub.current = Accelerometer.addListener(handleAccelerometer);
      
      // Magnetometer for compass heading - faster updates
      Magnetometer.setUpdateInterval(MAG_UPDATE_INTERVAL);
      magnetometerSub.current = Magnetometer.addListener(handleMagnetometer);
      
      setIsTracking(true);
      console.log('DEBUG RadarMap: Sensors started');
    } catch (error) {
      console.log('DEBUG RadarMap: Sensor error:', error);
    }
  };

  const stopSensors = () => {
    setIsTracking(false);
    if (accelerometerSub.current) {
      accelerometerSub.current.remove();
      accelerometerSub.current = null;
    }
    if (magnetometerSub.current) {
      magnetometerSub.current.remove();
      magnetometerSub.current = null;
    }
  };

  // ============ CALIBRATION (Rotation-based) ============
  
  const startCalibration = () => {
    console.log('DEBUG RadarMap: Starting rotation-based calibration...');
    setIsCalibrating(true);
    setShowCalibrationPrompt(false);
    setCalibrationProgress(0);
    setCalibrationData({});
    setDirectionsVisited(new Set());
  };

  const recordCalibrationSample = (rssi) => {
    // Get current heading quadrant (8 directions)
    const quadrant = getHeadingQuadrant(heading);
    
    // Update calibration data
    setCalibrationData(prev => {
      const existing = prev[quadrant] || [];
      return {
        ...prev,
        [quadrant]: [...existing, rssi],
      };
    });
    
    // Track visited directions
    setDirectionsVisited(prev => {
      const newSet = new Set(prev);
      newSet.add(quadrant);
      
      // Update progress based on directions visited
      const progress = newSet.size / MIN_DIRECTIONS_REQUIRED;
      setCalibrationProgress(Math.min(1, progress));
      
      console.log(`DEBUG Calibration: Facing ${quadrant}, visited ${newSet.size}/${MIN_DIRECTIONS_REQUIRED} directions`);
      
      // Auto-complete when enough directions visited
      if (newSet.size >= MIN_DIRECTIONS_REQUIRED) {
        setTimeout(() => finishCalibration(), 300); // Small delay for UI feedback
      }
      
      return newSet;
    });
  };

  const getHeadingQuadrant = (h) => {
    if (h >= 337.5 || h < 22.5) return 'N';
    if (h >= 22.5 && h < 67.5) return 'NE';
    if (h >= 67.5 && h < 112.5) return 'E';
    if (h >= 112.5 && h < 157.5) return 'SE';
    if (h >= 157.5 && h < 202.5) return 'S';
    if (h >= 202.5 && h < 247.5) return 'SW';
    if (h >= 247.5 && h < 292.5) return 'W';
    return 'NW';
  };

  const finishCalibration = () => {
    console.log('DEBUG RadarMap: Finishing rotation-based calibration...');
    setIsCalibrating(false);
    
    // Find direction with strongest signal
    let bestDirection = null;
    let bestRssi = -Infinity;
    
    Object.entries(calibrationData).forEach(([dir, readings]) => {
      if (readings.length > 0) {
        const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
        console.log(`DEBUG Calibration: ${dir}: avg RSSI = ${avg.toFixed(1)}, samples = ${readings.length}`);
        if (avg > bestRssi) {
          bestRssi = avg;
          bestDirection = dir;
        }
      }
    });
    
    if (bestDirection) {
      console.log('DEBUG Calibration: COMPLETE! Victim direction:', bestDirection);
      setCalibratedDirection(bestDirection);
      setVictimDirection(bestDirection);
      setVictimAngle(getAngleFromDirection(bestDirection));
      setIsCalibrated(true);
      Vibration.vibrate([0, 100, 100, 100]); // Success vibration
    } else {
      console.log('DEBUG Calibration: FAILED - no data collected');
      setIsCalibrated(false);
    }
  };

  const getAngleFromDirection = (dir) => {
    const angles = {
      'N': 0, 'NE': 45, 'E': 90, 'SE': 135,
      'S': 180, 'SW': 225, 'W': 270, 'NW': 315,
    };
    return angles[dir] || 0;
  };

  const skipCalibration = () => {
    setShowCalibrationPrompt(false);
    setIsCalibrated(false);
  };

  // ============ MOVEMENT DETECTION ============

  const handleAccelerometer = (data) => {
    const { x, y, z } = data;
    const now = Date.now();
    
    const accel = Math.sqrt(x * x + y * y + z * z);
    const lastAcc = Math.sqrt(
      lastAccel.current.x ** 2 + 
      lastAccel.current.y ** 2 + 
      lastAccel.current.z ** 2
    );
    
    const change = Math.abs(accel - lastAcc);
    
    if (change > STEP_THRESHOLD && (now - lastStepTime) > STEP_COOLDOWN) {
      console.log('DEBUG RadarMap: STEP!', { change: change.toFixed(2), steps: stepCount + 1 });
      setLastStepTime(now);
      setStepCount(prev => prev + 1);
      handleStep();
    }
    
    lastAccel.current = { x, y, z };
  };

  const handleMagnetometer = (data) => {
    const { x, y } = data;
    let h = Math.atan2(y, x) * (180 / Math.PI);
    if (h < 0) h += 360;
    const newHeading = Math.round(h);
    setHeading(newHeading);
    
    // Update movement direction based on heading
    const rad = (h * Math.PI) / 180;
    movementDirectionRef.current = {
      dx: Math.sin(rad),
      dy: -Math.cos(rad),
    };
  };

  const handleStep = () => {
    // Move the world in opposite direction of movement (creates scrolling effect)
    const { dx, dy } = movementDirectionRef.current;

    // Each step moves stepDistanceCm (from settings, default 65cm)
    const newOffset = {
      x: worldOffset.x - dx * stepDistanceCm,
      y: worldOffset.y - dy * stepDistanceCm,
    };

    setWorldOffset(newOffset);

    // Collect RSSI samples at current position for trilateration
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        // Convert world offset back to grid position relative to center
        const gridX = Math.round(-newOffset.x / CM_PER_CIRCLE);
        const gridY = Math.round(-newOffset.y / CM_PER_CIRCLE);

        // Store sample: {x, y, rssi, timestamp}
        const beaconId = selectedBeacon.deviceId;
        if (!rssiSamplesRef.current.has(beaconId)) {
          rssiSamplesRef.current.set(beaconId, []);
        }

        const samples = rssiSamplesRef.current.get(beaconId);
        samples.push({
          x: gridX,
          y: gridY,
          rssi: beacon.rssi,
          timestamp: Date.now(),
        });

        // Keep only last 20 samples
        if (samples.length > 20) {
          samples.shift();
        }

        console.log('DEBUG RadarMap: Collected RSSI sample -', { beaconId, gridX, gridY, rssi: beacon.rssi, totalSamples: samples.length });
      }
    }

    // Animate the scroll effect - faster animation
    Animated.sequence([
      Animated.timing(scrollAnim, {
        toValue: { x: -dx * 5, y: -dy * 5 },
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scrollAnim, {
        toValue: { x: 0, y: 0 },
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    // Vibrate on step
    Vibration.vibrate(30);
  };

  // ============ BEACON SIGNAL PROCESSING ============

  const processBeaconSignal = (rssi) => {
    // Calculate weighted RSSI - apply exponential decay for recent readings
    const now = Date.now();
    let weightedRssi = rssi;

    // If we have history, weight recent readings more heavily
    if (rssiHistory.length > 0) {
      const recent = rssiHistory.slice(-5); // Last 5 readings
      let totalWeight = 0;
      let weightedSum = 0;

      // Weight current reading highest
      const currentWeight = 1.0;
      weightedSum += rssi * currentWeight;
      totalWeight += currentWeight;

      // Weight previous readings with exponential decay
      recent.forEach(reading => {
        const ageSeconds = (now - reading.timestamp) / 1000;
        const weight = Math.exp(-ageSeconds / 10); // e^(-age/10) - 10 second half-life
        weightedSum += reading.rssi * weight;
        totalWeight += weight;
      });

      weightedRssi = weightedSum / totalWeight;
    }

    // Calculate distance from weighted RSSI
    const distanceM = Math.pow(10, (txPower - weightedRssi) / (10 * environmentFactor));
    const distanceCm = Math.round(distanceM * 100);

    setVictimDistance(distanceCm);

    // Track RSSI history for direction estimation (if not calibrated)
    if (!isCalibrated) {
      setRssiHistory(prev => {
        const newHistory = [...prev, { rssi, heading, timestamp: now }];
        return newHistory.slice(-20);
      });
      estimateVictimDirection(rssi);
    }

    // Check if victim is within visible map area (10m diameter = 5m radius = 500cm)
    if (distanceCm <= VISIBLE_RADIUS_CM) {
      setVictimOnMap(true);

      // Try to use trilateration if we have enough samples
      let victimPos = null;
      const beaconId = selectedBeacon?.deviceId;

      if (beaconId && rssiSamplesRef.current.has(beaconId)) {
        const samples = rssiSamplesRef.current.get(beaconId);
        if (samples.length >= 3) {
          // Use trilateration with collected samples
          // Convert grid positions to distance estimates
          const beaconDistances = samples.map(sample => {
            const dist = Math.pow(10, (txPower - sample.rssi) / (10 * environmentFactor)) * 100;
            return {
              x: sample.x * CM_PER_CIRCLE,
              y: sample.y * CM_PER_CIRCLE,
              distance: dist,
            };
          });

          const trilateratedPos = trilateratePosition(beaconDistances);
          if (trilateratedPos) {
            // Convert from cm to grid cells
            victimPos = {
              x: Math.round(GRID_SIZE / 2 + trilateratedPos.x / CM_PER_CIRCLE),
              y: Math.round(GRID_SIZE / 2 + trilateratedPos.y / CM_PER_CIRCLE),
            };
            console.log('DEBUG RadarMap: Trilaterated victim position:', victimPos, 'from', samples.length, 'samples');
          }
        }
      }

      // Fall back to single-point RSSI distance if trilateration unavailable
      if (!victimPos) {
        const angle = isCalibrated ? victimAngle : getEstimatedVictimAngle();
        const normalizedDist = distanceCm / VISIBLE_RADIUS_CM;
        victimPos = {
          x: Math.round(GRID_SIZE / 2 + normalizedDist * (GRID_SIZE / 2) * Math.sin(angle * Math.PI / 180)),
          y: Math.round(GRID_SIZE / 2 - normalizedDist * (GRID_SIZE / 2) * Math.cos(angle * Math.PI / 180)),
        };
        console.log('DEBUG RadarMap: Using RSSI-based position (insufficient samples for trilateration):', victimPos);
      }

      console.log('DEBUG RadarMap: Victim ON MAP:', victimPos, 'dist:', distanceCm, 'cm');
      setVictimMapPosition(victimPos);
    } else {
      console.log('DEBUG RadarMap: Victim OFF MAP - dist:', distanceCm, 'cm (max:', VISIBLE_RADIUS_CM, 'cm)');
      setVictimOnMap(false);
      setVictimMapPosition(null);
    }

    previousRssi.current = rssi;
  };

  const estimateVictimDirection = (currentRssi) => {
    if (rssiHistory.length < 5) {
      setVictimDirection(null);
      setDirectionConfidence(0);
      return;
    }
    
    // Analyze RSSI changes relative to heading changes
    const recent = rssiHistory.slice(-10);
    let bestDirection = null;
    let maxImprovement = -Infinity;
    
    // Group readings by 8 compass directions
    const directions = { N: [], NE: [], E: [], SE: [], S: [], SW: [], W: [], NW: [] };
    
    recent.forEach(reading => {
      const quadrant = getHeadingQuadrant(reading.heading);
      directions[quadrant].push(reading.rssi);
    });
    
    // Find which direction has strongest average signal
    Object.entries(directions).forEach(([dir, readings]) => {
      if (readings.length > 0) {
        const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
        if (avg > maxImprovement) {
          maxImprovement = avg;
          bestDirection = dir;
        }
      }
    });
    
    if (bestDirection) {
      setVictimDirection(bestDirection);
      setVictimAngle(getAngleFromDirection(bestDirection));
    }
    setDirectionConfidence(Math.min(1, rssiHistory.length / 15));
  };

  const getEstimatedVictimAngle = () => {
    return victimAngle;
  };

  const getCompassDirection = (h) => {
    return getHeadingQuadrant(h);
  };

  const getDirectionArrow = () => {
    if (!victimDirection || victimOnMap) return null;
    
    const arrows = {
      'N': 'arrow-up-bold',
      'NE': 'arrow-top-right-bold',
      'E': 'arrow-right-bold',
      'SE': 'arrow-bottom-right-bold',
      'S': 'arrow-down-bold',
      'SW': 'arrow-bottom-left-bold',
      'W': 'arrow-left-bold',
      'NW': 'arrow-top-left-bold',
    };
    
    return { icon: arrows[victimDirection] || 'arrow-up-bold' };
  };

  // ============ GRID RENDERING ============

  const renderGrid = useMemo(() => {
    const circles = [];
    const centerX = Math.floor(GRID_SIZE / 2);
    const centerY = Math.floor(GRID_SIZE / 2);
    
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const isCenter = row === centerY && col === centerX;
        const isVictim = victimOnMap && victimMapPosition && 
                         row === victimMapPosition.y && col === victimMapPosition.x;
        
        // Calculate distance from center for gradient effect
        const distFromCenter = Math.sqrt(
          Math.pow(col - centerX, 2) + Math.pow(row - centerY, 2)
        );
        const maxDist = Math.sqrt(2) * (GRID_SIZE / 2);
        const opacity = 1 - (distFromCenter / maxDist) * 0.4;
        
        let circleStyle = {
          width: CIRCLE_SIZE - CIRCLE_MARGIN * 2,
          height: CIRCLE_SIZE - CIRCLE_MARGIN * 2,
          borderRadius: (CIRCLE_SIZE - CIRCLE_MARGIN * 2) / 2,
          margin: CIRCLE_MARGIN,
          opacity,
          justifyContent: 'center',
          alignItems: 'center',
        };
        
        if (isCenter) {
          circleStyle.backgroundColor = COLORS.info;
          circleStyle.borderWidth = 2;
          circleStyle.borderColor = COLORS.text;
        } else if (isVictim) {
          circleStyle.backgroundColor = '#FF4444';
          circleStyle.borderWidth = 2;
          circleStyle.borderColor = '#FF0000';
        } else {
          circleStyle.backgroundColor = COLORS.surface;
          circleStyle.borderWidth = 1;
          circleStyle.borderColor = COLORS.border;
        }
        
        circles.push(
          <View key={`${row}-${col}`} style={circleStyle}>
            {isCenter && (
              <Icon 
                name="navigation" 
                size={CIRCLE_SIZE * 0.5} 
                color={COLORS.text}
                style={{ transform: [{ rotate: `${heading}deg` }] }}
              />
            )}
            {isVictim && (
              <Icon name="account-alert" size={CIRCLE_SIZE * 0.5} color="#FFFFFF" />
            )}
          </View>
        );
      }
    }
    
    return circles;
  }, [heading, victimOnMap, victimMapPosition]);

  const renderDirectionIndicator = () => {
    if (victimOnMap || !victimDirection) return null;
    
    const arrow = getDirectionArrow();
    if (!arrow) return null;
    
    // Position based on 8 compass directions
    const positions = {
      'N': { top: 10, left: '50%', marginLeft: -30 },
      'NE': { top: 20, right: 20 },
      'E': { right: 10, top: '50%', marginTop: -30 },
      'SE': { bottom: 20, right: 20 },
      'S': { bottom: 10, left: '50%', marginLeft: -30 },
      'SW': { bottom: 20, left: 20 },
      'W': { left: 10, top: '50%', marginTop: -30 },
      'NW': { top: 20, left: 20 },
    };
    
    return (
      <View style={[styles.directionIndicator, positions[victimDirection]]}>
        <Icon 
          name={arrow.icon} 
          size={40} 
          color={COLORS.primary}
        />
        <Text style={styles.directionText}>
          {victimDistance ? `~${(victimDistance / 100).toFixed(1)}m` : '?'}
        </Text>
      </View>
    );
  };

  // ============ CALIBRATION UI ============

  const renderCalibrationPrompt = () => (
    <Modal
      visible={showCalibrationPrompt && selectedBeacon}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Icon name="compass-outline" size={60} color={COLORS.primary} />
          <Text style={styles.modalTitle}>Calibrate for Better Accuracy?</Text>
          <Text style={styles.modalText}>
            Hold your phone flat and slowly rotate to face all directions. The app will detect when you've completed the rotation.
          </Text>
          <Text style={styles.modalSubtext}>Face at least 6 of 8 compass directions</Text>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButtonPrimary} onPress={startCalibration}>
              <Icon name="compass" size={20} color="#FFF" />
              <Text style={styles.modalButtonTextPrimary}>Calibrate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButtonSecondary} onPress={skipCalibration}>
              <Text style={styles.modalButtonTextSecondary}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCalibrationOverlay = () => {
    if (!isCalibrating) return null;
    
    const currentDir = getHeadingQuadrant(heading);
    
    return (
      <View style={styles.calibrationOverlay}>
        {/* Compass rose showing visited directions */}
        <View style={styles.compassRose}>
          {ALL_DIRECTIONS.map((dir, index) => {
            const isVisited = directionsVisited.has(dir);
            const isCurrent = dir === currentDir;
            const angle = index * 45 - 90; // Start from top (N)
            const radius = 70;
            const x = Math.cos(angle * Math.PI / 180) * radius;
            const y = Math.sin(angle * Math.PI / 180) * radius;
            
            return (
              <View
                key={dir}
                style={[
                  styles.compassPoint,
                  {
                    transform: [{ translateX: x }, { translateY: y }],
                  },
                ]}
              >
                <View style={[
                  styles.compassDot,
                  isVisited && styles.compassDotVisited,
                  isCurrent && styles.compassDotCurrent,
                ]}>
                  <Text style={[
                    styles.compassLabel,
                    isVisited && styles.compassLabelVisited,
                  ]}>
                    {dir}
                  </Text>
                </View>
              </View>
            );
          })}
          
          {/* Center indicator */}
          <View style={styles.compassCenter}>
            <Icon name="navigation" size={30} color={COLORS.primary} 
              style={{ transform: [{ rotate: `${heading}deg` }] }} />
          </View>
        </View>
        
        <Text style={styles.calibrationInstruction}>
          Rotate slowly to face each direction
        </Text>
        <Text style={styles.calibrationProgress}>
          {directionsVisited.size} / {MIN_DIRECTIONS_REQUIRED} directions
        </Text>
        <Text style={styles.calibrationHeading}>
          Currently facing: {currentDir}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Calibration Prompt Modal */}
      {renderCalibrationPrompt()}
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>🎯 Radar Navigation</Text>
          {isCalibrated && (
            <View style={styles.calibratedBadge}>
              <Icon name="check-circle" size={14} color="#4CAF50" />
              <Text style={styles.calibratedText}>Calibrated</Text>
            </View>
          )}
        </View>
        {selectedBeacon ? (
          <Text style={styles.subtitle}>Tracking: {selectedBeacon.deviceName}</Text>
        ) : (
          <Text style={styles.warningText}>⚠️ No beacon selected</Text>
        )}
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Icon name="compass" size={18} color={COLORS.text} />
          <Text style={styles.statusText}>{getCompassDirection(heading)} ({heading}°)</Text>
        </View>
        <View style={styles.statusItem}>
          <Icon name="map-marker-distance" size={18} color={COLORS.text} />
          <Text style={styles.statusText}>
            {victimDistance ? `${(victimDistance / 100).toFixed(1)}m` : '--'}
          </Text>
        </View>
      </View>

      {/* Direction Guidance */}
      {victimDirection && !victimOnMap && (
        <View style={styles.guidanceBar}>
          <Icon name="map-marker-radius" size={20} color={COLORS.primary} />
          <Text style={styles.directionHint}>
            Victim is {victimDirection} • ~{victimDistance ? (victimDistance / 100).toFixed(1) : '?'}m away
          </Text>
        </View>
      )}

      {/* Radar Grid */}
      <View style={styles.radarContainer}>
        {/* Calibration overlay */}
        {renderCalibrationOverlay()}
        
        {!isCalibrating && (
          <>
            <Animated.View 
              style={[
                styles.gridWrapper,
                {
                  transform: [
                    { translateX: scrollAnim.x },
                    { translateY: scrollAnim.y },
                  ],
                },
              ]}
            >
              <View style={styles.grid}>
                {renderGrid}
              </View>
            </Animated.View>
            
            {/* Direction indicator for far victims */}
            {renderDirectionIndicator()}
            
            {/* Center crosshair */}
            <View style={styles.crosshairH} />
            <View style={styles.crosshairV} />
          </>
        )}
      </View>

      {/* Legend & Info */}
      <View style={styles.bottomBar}>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, { backgroundColor: COLORS.info }]} />
            <Text style={styles.legendText}>You</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, { backgroundColor: '#FF4444' }]} />
            <Text style={styles.legendText}>Victim</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.legendText}>Range: 10m</Text>
          </View>
        </View>
        
        {/* Recalibrate button */}
        {!isCalibrating && selectedBeacon && (
          <TouchableOpacity style={styles.recalibrateButton} onPress={startCalibration}>
            <Icon name="compass" size={16} color={COLORS.text} />
            <Text style={styles.recalibrateText}>Recalibrate</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 12,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  calibratedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 205, 100, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  calibratedText: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.warning,
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    marginHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '500',
  },
  guidanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginVertical: 10,
    padding: 14,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  directionHint: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  radarContainer: {
    flex: 1,
    margin: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: GRID_SIZE * CIRCLE_SIZE,
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 50,
    height: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.5,
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 50,
    backgroundColor: COLORS.primary,
    opacity: 0.5,
  },
  directionIndicator: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  directionText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  recalibrateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recalibrateText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  // Calibration Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  modalSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  modalButtons: {
    marginTop: 20,
    width: '100%',
    gap: 10,
  },
  modalButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalButtonTextPrimary: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonSecondary: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalButtonTextSecondary: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  // Calibration Overlay Styles
  calibrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  compassRose: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassPoint: {
    position: 'absolute',
  },
  compassDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  compassDotVisited: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  compassDotCurrent: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  compassLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
  },
  compassLabelVisited: {
    color: '#FFFFFF',
  },
  compassCenter: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calibrationInstruction: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 30,
    fontWeight: '500',
  },
  calibrationProgress: {
    fontSize: 20,
    color: COLORS.primary,
    marginTop: 10,
    fontWeight: 'bold',
  },
  calibrationHeading: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
});

export default RadarMapScreen;
