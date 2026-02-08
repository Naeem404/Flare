/**
 * FLARE AR View Screen
 * Real camera-based AR directional beacon finder
 * Shows rescuer's camera feed with beacon markers and direction indicators
 * Overlays navigate based on compass heading and gyroscope tilt
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  AppState,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer, Magnetometer, Barometer } from 'expo-sensors';
import { useBluetooth } from '../context/BluetoothContext';
import { COLORS } from '../utils/constants';
import { formatDistance, getSignalQuality } from '../utils/rssiCalculator';

const { width, height } = Dimensions.get('window');

// Constants for AR positioning
const FOV = 70; // Field of view in degrees (typical smartphone)
const COMPASS_HISTORY_SIZE = 5;
const BAROMETER_HISTORY_SIZE = 10;
const ALTITUDE_THRESHOLD_METERS = 2; // Minimum altitude difference to show above/below
const MARKER_SIZE_MIN = 40;
const MARKER_SIZE_MAX = 100;

// Bearing estimation constants
const BEARING_ESTIMATE_INTERVAL = 500; // Update bearing estimate every 500ms to smooth jitter
const BEARING_SAMPLE_HISTORY = 100; // Keep last 100 samples per beacon
const BEARING_SECTOR_SIZE = 30; // 30-degree sectors (12 total around 360°)
const BEARING_CALIBRATION_THRESHOLD = 8; // Need 8+ sectors sampled to consider calibrated

const ARViewScreen = ({ navigation }) => {
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  const [permission, requestPermission] = useCameraPermissions();

  // Sensor state
  const [phoneHeading, setPhoneHeading] = useState(0); // Compass heading 0-360
  const [phonePitch, setPhonePitch] = useState(0); // Tilt angle -90 to +90
  const [baselineAltitude, setBaselineAltitude] = useState(null);
  const [currentAltitude, setCurrentAltitude] = useState(null);

  // UI state
  const [markerAnimation] = useState(new Animated.Value(0));
  const [cameraReady, setCameraReady] = useState(false);
  const [altitudeBannerVisible, setAltitudeBannerVisible] = useState(false);
  const [altitudeBannerType, setAltitudeBannerType] = useState('above'); // 'above' or 'below'
  const [bannerPulseAnim] = useState(new Animated.Value(0));

  // Refs for sensor subscriptions
  const accelerometerSub = useRef(null);
  const magnetometerSub = useRef(null);
  const barometerSub = useRef(null);
  const compassHistoryRef = useRef([]);
  const altitudeHistoryRef = useRef([]);
  const appStateRef = useRef(AppState.currentState);

  // Bearing estimation refs
  const bearingMapRef = useRef(new Map()); // Map<beaconId, { samples: [{heading, rssi}], estimatedBearing, calibrationSectors }>
  const lastBearingUpdateRef = useRef({}); // Track last time we updated bearing estimate for each beacon
  const bearingAnimationsRef = useRef(new Map()); // Map<beaconId, Animated.Value for smooth position updates>

  // Initialize camera permissions
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  // Start sensors on mount and stop on navigation blur
  useEffect(() => {
    startSensors();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Stop sensors when navigating away to prevent crash
    const unsubBlur = navigation.addListener('blur', () => {
      stopSensors();
      setCameraReady(false);
    });

    const unsubFocus = navigation.addListener('focus', () => {
      startSensors();
    });

    return () => {
      stopSensors();
      subscription.remove();
      unsubBlur();
      unsubFocus();
    };
  }, [navigation]);

  // Animate markers on each frame
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(markerAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(markerAnimation, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [markerAnimation]);

  // Animate altitude banner pulse
  useEffect(() => {
    if (altitudeBannerVisible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bannerPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(bannerPulseAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [altitudeBannerVisible, bannerPulseAnim]);

  const handleAppStateChange = (nextAppState) => {
    if (
      appStateRef.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      startSensors();
    } else if (nextAppState.match(/inactive|background/)) {
      stopSensors();
    }
    appStateRef.current = nextAppState;
  };

  const startSensors = async () => {
    try {
      // Check barometer availability and set baseline
      try {
        const baroAvailable = await Barometer.isAvailableAsync();
        if (baroAvailable) {
          const baroData = await Barometer.getLastKnownReading();
          if (baroData) {
            setBaselineAltitude(calculateAltitude(baroData.pressure));
            console.log('DEBUG ARView: Baseline altitude:', baselineAltitude);
          }
          Barometer.setUpdateInterval(500);
          barometerSub.current = Barometer.addListener(handleBarometer);
        }
      } catch (e) {
        console.log('DEBUG ARView: Barometer not available:', e.message);
      }

      // Setup accelerometer for pitch calculation
      const accelAvailable = await Accelerometer.isAvailableAsync();
      if (accelAvailable) {
        Accelerometer.setUpdateInterval(100);
        accelerometerSub.current = Accelerometer.addListener(handleAccelerometer);
      }

      // Setup magnetometer for compass heading
      const magAvailable = await Magnetometer.isAvailableAsync();
      if (magAvailable) {
        Magnetometer.setUpdateInterval(100);
        magnetometerSub.current = Magnetometer.addListener(handleMagnetometer);
      }
    } catch (error) {
      console.error('DEBUG ARView: Sensor initialization error:', error);
    }
  };

  const stopSensors = () => {
    if (accelerometerSub.current) {
      accelerometerSub.current.remove();
      accelerometerSub.current = null;
    }
    if (magnetometerSub.current) {
      magnetometerSub.current.remove();
      magnetometerSub.current = null;
    }
    if (barometerSub.current) {
      barometerSub.current.remove();
      barometerSub.current = null;
    }
  };

  const handleAccelerometer = (data) => {
    const { x, y, z } = data;
    // Calculate pitch: tilt up/down angle
    // Positive = tilted up, Negative = tilted down
    const pitch = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);
    setPhonePitch(Math.round(pitch));
  };

  const handleMagnetometer = (data) => {
    const { x, y } = data;
    let heading = Math.atan2(y, x) * (180 / Math.PI);
    if (heading < 0) heading += 360;
    heading = Math.round(heading);

    // Smooth heading with history
    compassHistoryRef.current.push(heading);
    if (compassHistoryRef.current.length > COMPASS_HISTORY_SIZE) {
      compassHistoryRef.current.shift();
    }

    const smoothedHeading =
      compassHistoryRef.current.reduce((a, b) => a + b, 0) /
      compassHistoryRef.current.length;
    const roundedHeading = Math.round(smoothedHeading);
    setPhoneHeading(roundedHeading);

    // Record heading and RSSI pairs for bearing estimation
    if (detectedBeacons.length > 0) {
      recordBearingSamples(roundedHeading);
    }
  };

  const handleBarometer = (data) => {
    const altitude = calculateAltitude(data.pressure);
    setCurrentAltitude(altitude);

    // Track altitude history
    altitudeHistoryRef.current.push(altitude);
    if (altitudeHistoryRef.current.length > BAROMETER_HISTORY_SIZE) {
      altitudeHistoryRef.current.shift();
    }
  };

  const calculateAltitude = (pressure) => {
    // Simplified barometric altitude formula
    // altitude (m) = 44330 * (1 - (P/P0)^(1/5.255))
    // P0 = 101325 Pa (sea level standard pressure)
    const P0 = 101325;
    const altitude = 44330 * (1 - Math.pow(pressure / P0, 1 / 5.255));
    return altitude;
  };

  /**
   * Record heading and RSSI pairs for bearing estimation
   * Called every time magnetometer fires with beacon data available
   */
  const recordBearingSamples = (currentHeading) => {
    detectedBeacons.forEach((beacon) => {
      const beaconId = beacon.deviceId;

      // Initialize beacon entry if needed
      if (!bearingMapRef.current.has(beaconId)) {
        bearingMapRef.current.set(beaconId, {
          samples: [],
          estimatedBearing: null,
          calibrationSectors: new Set(),
        });
      }

      const beaconData = bearingMapRef.current.get(beaconId);

      // Add new sample
      beaconData.samples.push({
        heading: currentHeading,
        rssi: beacon.rssi,
        timestamp: Date.now(),
      });

      // Keep only last N samples
      if (beaconData.samples.length > BEARING_SAMPLE_HISTORY) {
        beaconData.samples.shift();
      }

      // Update which sectors have been sampled
      const sector = Math.floor(currentHeading / BEARING_SECTOR_SIZE);
      beaconData.calibrationSectors.add(sector);
    });
  };

  /**
   * Calculate bearing estimate from heading/RSSI samples
   * Finds the heading range with strongest average RSSI
   */
  const calculateEstimatedBearing = (beaconId) => {
    const beaconData = bearingMapRef.current.get(beaconId);
    if (!beaconData || beaconData.samples.length < 5) {
      return null; // Not enough data
    }

    // Divide into 30° sectors and calculate average RSSI per sector
    const sectorData = {};
    for (let i = 0; i < 12; i++) {
      sectorData[i] = { rssiSum: 0, count: 0 };
    }

    beaconData.samples.forEach(({ heading, rssi }) => {
      const sector = Math.floor(heading / BEARING_SECTOR_SIZE);
      sectorData[sector].rssiSum += rssi;
      sectorData[sector].count += 1;
    });

    // Find sector with highest average RSSI
    let bestSector = 0;
    let bestAvgRssi = -1000;

    for (let i = 0; i < 12; i++) {
      if (sectorData[i].count > 0) {
        const avgRssi = sectorData[i].rssiSum / sectorData[i].count;
        if (avgRssi > bestAvgRssi) {
          bestAvgRssi = avgRssi;
          bestSector = i;
        }
      }
    }

    // Return center of best sector (0-30 -> 15, 30-60 -> 45, etc.)
    return bestSector * BEARING_SECTOR_SIZE + BEARING_SECTOR_SIZE / 2;
  };

  /**
   * Get bearing for a beacon, using estimated value from samples
   * Before calibration, returns null to show "?" icon
   */
  const calculateBeaconBearing = (beacon) => {
    const beaconId = beacon.deviceId;

    // Check if we need to update the bearing estimate
    const now = Date.now();
    const lastUpdate = lastBearingUpdateRef.current[beaconId] || 0;

    if (now - lastUpdate > BEARING_ESTIMATE_INTERVAL) {
      // Time to recalculate bearing estimate
      const newBearing = calculateEstimatedBearing(beaconId);
      if (newBearing !== null) {
        const beaconData = bearingMapRef.current.get(beaconId);
        beaconData.estimatedBearing = newBearing;
      }
      lastBearingUpdateRef.current[beaconId] = now;
    }

    // Return estimated bearing, or null if not yet calibrated
    const beaconData = bearingMapRef.current.get(beaconId);
    return beaconData?.estimatedBearing ?? null;
  };

  /**
   * Get calibration progress for a beacon (0-12 sectors)
   */
  const getBeaconCalibrationProgress = (beaconId) => {
    const beaconData = bearingMapRef.current.get(beaconId);
    if (!beaconData) return { sampled: 0, total: 12, isCalibrated: false };

    const sampled = beaconData.calibrationSectors.size;
    const isCalibrated = sampled >= BEARING_CALIBRATION_THRESHOLD;
    return { sampled, total: 12, isCalibrated };
  };

  const isBeaconOnScreen = (bearingDiff) => {
    return Math.abs(bearingDiff) < FOV / 2;
  };

  const getMarkerPosition = (beacon) => {
    const beaconBearing = calculateBeaconBearing(beacon);
    const calibration = getBeaconCalibrationProgress(beacon.deviceId);

    let bearingDiff = 0;
    let onScreen = true;
    let opacity = 0.7;

    // If not yet calibrated, show at default position with reduced opacity
    if (!calibration.isCalibrated || beaconBearing === null) {
      // Default: show to the right center, with "?" icon
      bearingDiff = 30; // Offset to right
      opacity = 0.4; // Lower opacity for uncalibrated
    } else {
      bearingDiff = beaconBearing - phoneHeading;

      // Normalize to -180 to 180
      while (bearingDiff > 180) bearingDiff -= 360;
      while (bearingDiff < -180) bearingDiff += 360;

      // Check if on screen
      onScreen = isBeaconOnScreen(bearingDiff);

      // Opacity based on signal strength (for calibrated beacons)
      const signalQuality = getSignalQuality(beacon.rssi);
      opacity = 0.7 + signalQuality.bars * 0.06;
    }

    // Horizontal position based on bearing
    // Center = 0°, left = -FOV/2, right = +FOV/2
    const normalizedX = (bearingDiff / FOV) * 2; // -1 to +1
    const screenX = width / 2 + normalizedX * (width / 2);

    // Vertical position based on phone pitch
    // Center = 0°, up = -90°, down = +90°
    const pitchFactor = (phonePitch / 90) * (height / 3);
    const screenY = height / 2 - pitchFactor;

    // Altitude offset
    let altitudeOffset = 0;
    if (baselineAltitude !== null && currentAltitude !== null) {
      const altDelta = currentAltitude - baselineAltitude;
      if (altDelta > ALTITUDE_THRESHOLD_METERS) {
        altitudeOffset = -80; // Show above
        // Update altitude banner
        setAltitudeBannerVisible(true);
        setAltitudeBannerType('above');
      } else if (altDelta < -ALTITUDE_THRESHOLD_METERS) {
        altitudeOffset = 80; // Show below
        // Update altitude banner
        setAltitudeBannerVisible(true);
        setAltitudeBannerType('below');
      } else {
        setAltitudeBannerVisible(false);
      }
    }

    // Size based on distance (closer = bigger)
    const distanceFactor = Math.max(0.5, Math.min(1, 20 / beacon.distance));
    const markerSize = MARKER_SIZE_MIN + distanceFactor * (MARKER_SIZE_MAX - MARKER_SIZE_MIN);

    const signalQuality = getSignalQuality(beacon.rssi);

    return {
      screenX,
      screenY: screenY + altitudeOffset,
      markerSize,
      opacity,
      onScreen,
      bearingDiff,
      altitudeOffset,
      signalQuality,
      isCalibrated: calibration.isCalibrated,
    };
  };

  const renderBeaconMarker = (beacon) => {
    const position = getMarkerPosition(beacon);
    const calibration = getBeaconCalibrationProgress(beacon.deviceId);

    if (!position.onScreen) return null;

    const pulseScale = markerAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.3],
    });

    return (
      <Animated.View
        key={beacon.deviceId}
        style={[
          styles.markerContainer,
          {
            left: position.screenX - position.markerSize / 2,
            top: position.screenY - position.markerSize / 2,
            opacity: position.opacity,
          },
        ]}
      >
        {/* Pulsing circle background */}
        <Animated.View
          style={[
            styles.markerPulse,
            {
              width: position.markerSize,
              height: position.markerSize,
              borderRadius: position.markerSize / 2,
              backgroundColor: position.signalQuality.color,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />

        {/* Marker icon */}
        <View
          style={[
            styles.markerIcon,
            {
              width: position.markerSize,
              height: position.markerSize,
              borderRadius: position.markerSize / 2,
              backgroundColor: position.signalQuality.color,
            },
          ]}
        >
          <Icon
            name={position.isCalibrated ? 'account-alert' : 'help-circle'}
            size={position.markerSize * 0.6}
            color={COLORS.text}
          />
        </View>

        {/* Info below marker */}
        <View style={styles.markerInfo}>
          <Text style={styles.markerDistance} numberOfLines={1}>
            {formatDistance(beacon.distance)}
          </Text>

          {/* Calibration progress indicator */}
          {!position.isCalibrated && (
            <View style={styles.calibrationIndicator}>
              <Icon
                name="rotate-3d"
                size={10}
                color={COLORS.primary}
              />
              <Text style={styles.calibrationText}>
                {calibration.sampled}/{calibration.total}
              </Text>
            </View>
          )}

          {/* Altitude indicator */}
          {position.altitudeOffset !== 0 && (
            <View style={styles.altitudeIndicator}>
              <Icon
                name={position.altitudeOffset < 0 ? 'arrow-up' : 'arrow-down'}
                size={12}
                color={COLORS.primary}
              />
              <Text style={styles.altitudeText}>
                {position.altitudeOffset < 0 ? 'ABOVE' : 'BELOW'}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  const renderDirectionArrow = (beacon) => {
    const position = getMarkerPosition(beacon);

    // Only show arrow if beacon is off-screen
    if (position.onScreen) return null;

    let arrowPosition = {};
    let arrowIcon = '';

    if (position.bearingDiff < -90) {
      arrowIcon = 'arrow-left-bold';
      arrowPosition = { left: 20, top: height / 2 - 20 };
    } else if (position.bearingDiff > 90) {
      arrowIcon = 'arrow-right-bold';
      arrowPosition = { right: 20, top: height / 2 - 20 };
    } else if (position.bearingDiff < 0) {
      arrowIcon = 'arrow-left';
      arrowPosition = { left: 20, top: 60 };
    } else {
      arrowIcon = 'arrow-right';
      arrowPosition = { right: 20, top: 60 };
    }

    const angle = Math.abs(position.bearingDiff);
    const direction = position.bearingDiff < 0 ? 'LEFT' : 'RIGHT';

    return (
      <View key={`arrow-${beacon.deviceId}`} style={[styles.arrowContainer, arrowPosition]}>
        <Icon
          name={arrowIcon}
          size={40}
          color={COLORS.primary}
          style={{ marginBottom: 5 }}
        />
        <Text style={styles.arrowText}>
          {Math.round(angle)}° {direction}
        </Text>
        <Text style={styles.arrowDistance}>{formatDistance(beacon.distance)}</Text>
      </View>
    );
  };

  const renderAltitudeBanner = () => {
    if (!altitudeBannerVisible) return null;

    const bannerScale = bannerPulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.1],
    });

    const bannerOpacity = bannerPulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.9, 1],
    });

    const icon = altitudeBannerType === 'above' ? 'arrow-up' : 'arrow-down';
    const label = altitudeBannerType === 'above' ? 'SIGNAL ABOVE' : 'SIGNAL BELOW';

    return (
      <Animated.View
        style={[
          styles.altitudeBanner,
          {
            transform: [{ scale: bannerScale }],
            opacity: bannerOpacity,
          },
        ]}
      >
        <Icon name={icon} size={20} color={COLORS.text} />
        <Text style={styles.altitudeBannerText}>{label}</Text>
        <Icon name={icon} size={20} color={COLORS.text} />
      </Animated.View>
    );
  };

  const renderCompassStrip = () => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];

    return (
      <View style={styles.compassStrip}>
        {directions.map((dir, index) => {
          const angle = angles[index];
          const isCurrent =
            (angle >= phoneHeading - 22.5 && angle <= phoneHeading + 22.5) ||
            (angle === 0 && (phoneHeading >= 337.5 || phoneHeading <= 22.5));

          return (
            <View
              key={dir}
              style={[
                styles.compassPoint,
                isCurrent && styles.compassPointActive,
              ]}
            >
              <Text
                style={[
                  styles.compassText,
                  isCurrent && styles.compassTextActive,
                ]}
              >
                {dir}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderInfoPanel = () => {
    if (!selectedBeacon) {
      return (
        <View style={styles.infoPanelNeutral}>
          <Icon name="broadcast-off" size={20} color={COLORS.textMuted} />
          <Text style={styles.infoPanelText}>
            {isScanning ? 'Scanning for beacons...' : 'No beacon selected'}
          </Text>
        </View>
      );
    }

    const signalQuality = getSignalQuality(selectedBeacon.rssi);
    const position = getMarkerPosition(selectedBeacon);
    const calibration = getBeaconCalibrationProgress(selectedBeacon.deviceId);
    const bearing = calculateBeaconBearing(selectedBeacon);
    const altStatus =
      position.altitudeOffset > 0
        ? 'Below'
        : position.altitudeOffset < 0
          ? 'Above'
          : 'Same Level';

    return (
      <View style={styles.infoPanel}>
        <View style={styles.infoPanelHeader}>
          <View>
            <Text style={styles.infoPanelTitle}>Tracking</Text>
            <Text style={styles.infoPanelName}>{selectedBeacon.deviceName}</Text>
          </View>
          <View style={styles.signalIndicator}>
            {[...Array(signalQuality.bars)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.signalBar,
                  {
                    backgroundColor: signalQuality.color,
                    height: 20 - i * 4,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Calibration progress */}
        {!calibration.isCalibrated && (
          <View style={styles.calibrationProgressContainer}>
            <Icon name="rotate-3d" size={14} color={COLORS.primary} />
            <Text style={styles.calibrationProgressText}>
              Rotate slowly to calibrate • {calibration.sampled}/{calibration.total} directions sampled
            </Text>
          </View>
        )}

        <View style={styles.infoPanelStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValue}>{formatDistance(selectedBeacon.distance)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Direction</Text>
            <Text style={styles.statValue}>
              {bearing !== null ? `${Math.round(bearing)}°` : '?'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Altitude</Text>
            <Text style={styles.statValue}>{altStatus}</Text>
          </View>
        </View>

        <View style={styles.instruction}>
          <Icon name="information" size={14} color={COLORS.info} />
          <Text style={styles.instructionText}>
            {calibration.isCalibrated
              ? 'Rotate to refine accuracy. Markers show beacon position.'
              : 'Rotate slowly to calibrate direction. Move around the beacon.'}
          </Text>
        </View>
      </View>
    );
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon name="camera-off" size={80} color={COLORS.textMuted} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            FLARE needs camera access to show the AR beacon finder. Point your phone
            at your surroundings to see beacon locations overlaid on your camera feed.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Icon name="camera" size={20} color={COLORS.text} />
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Icon name="camera-off" size={80} color={COLORS.danger} />
          <Text style={styles.permissionTitle}>Camera Permission Denied</Text>
          <Text style={styles.permissionText}>
            Camera permission was denied. FLARE cannot show the AR view without it.
            Please enable camera access in your device settings.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => {
              Alert.alert(
                'Open Settings',
                'Go to Settings > FLARE > Camera and enable camera access'
              );
            }}
          >
            <Icon name="cog" size={20} color={COLORS.text} />
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Camera and overlay as SIBLINGS to prevent Fabric unmount crash */}
      <View style={styles.cameraContainer}>
        <CameraView style={StyleSheet.absoluteFill} onCameraReady={() => setCameraReady(true)} />

        {/* Overlay — positioned on top of camera but NOT a child of CameraView */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
          {/* Altitude banner */}
          {renderAltitudeBanner()}

          {/* Compass strip at top */}
          {renderCompassStrip()}

          {/* Beacon markers */}
          {cameraReady &&
            detectedBeacons.map((beacon) => renderBeaconMarker(beacon))}

          {/* Direction arrows for off-screen beacons */}
          {cameraReady &&
            detectedBeacons.map((beacon) => renderDirectionArrow(beacon))}

          {/* Crosshair center */}
          <View style={styles.crosshair}>
            <View style={styles.crosshairH} />
            <View style={styles.crosshairV} />
          </View>

          {/* Debug info overlay (optional) */}
          {__DEV__ && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>H: {phoneHeading}°</Text>
              <Text style={styles.debugText}>P: {phonePitch}°</Text>
              {baselineAltitude !== null && currentAltitude !== null && (
                <Text style={styles.debugText}>
                  A: {(currentAltitude - baselineAltitude).toFixed(1)}m
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Info panel at bottom */}
      {renderInfoPanel()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 20,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 25,
    gap: 10,
  },
  permissionButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  compassStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  compassPoint: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  compassPointActive: {
    backgroundColor: COLORS.primary,
  },
  compassText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: 'bold',
  },
  compassTextActive: {
    color: COLORS.text,
  },
  markerContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  markerPulse: {
    position: 'absolute',
    opacity: 0.3,
  },
  markerIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  markerInfo: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  markerDistance: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  calibrationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  calibrationText: {
    fontSize: 9,
    color: COLORS.primary,
    fontWeight: '600',
  },
  altitudeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  altitudeText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '600',
  },
  altitudeBanner: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: COLORS.emergency,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  altitudeBannerText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  arrowContainer: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  arrowText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 3,
  },
  arrowDistance: {
    color: COLORS.text,
    fontSize: 10,
    marginTop: 2,
  },
  crosshair: {
    position: 'absolute',
    top: height / 2 - 20,
    left: width / 2 - 20,
    width: 40,
    height: 40,
  },
  crosshairH: {
    position: 'absolute',
    top: 19,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  crosshairV: {
    position: 'absolute',
    left: 19,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  infoPanel: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  infoPanelNeutral: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoPanelText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calibrationProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  calibrationProgressText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  infoPanelTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoPanelName: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: 'bold',
    marginTop: 2,
  },
  signalIndicator: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'flex-end',
    height: 25,
  },
  signalBar: {
    width: 4,
    borderRadius: 2,
  },
  infoPanelStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(90, 200, 250, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  instructionText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  debugInfo: {
    position: 'absolute',
    bottom: 100,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  debugText: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

export default ARViewScreen;
