/**
 * FLARE AR View Screen
 * Augmented Reality view with 3D markers (Stretch Goal)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useBluetooth } from '../context/BluetoothContext';
import SignalStrength from '../components/SignalStrength';
import { COLORS } from '../utils/constants';
import { formatDistance, getSignalQuality } from '../utils/rssiCalculator';

const { width, height } = Dimensions.get('window');

const ARViewScreen = ({ navigation }) => {
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [arEnabled, setArEnabled] = useState(false);

  useEffect(() => {
    checkCameraPermissions();
  }, []);

  const checkCameraPermissions = async () => {
    setIsCameraReady(true);
  };

  const handleEnableAR = () => {
    Alert.alert(
      'AR View',
      'AR functionality requires camera access and ARCore/ARKit support. This is a preview of the AR interface.',
      [{ text: 'OK', onPress: () => setArEnabled(true) }]
    );
  };

  const renderBeaconMarker = (beacon, index) => {
    const signalQuality = getSignalQuality(beacon.rssi);
    const angle = (index * 60) - 30;
    const distanceScale = Math.min(1, 10 / beacon.distance);
    
    return (
      <View
        key={beacon.deviceId}
        style={[
          styles.arMarker,
          {
            left: width / 2 + Math.sin(angle * Math.PI / 180) * 100 - 40,
            top: height / 3 - distanceScale * 100,
            opacity: 0.7 + distanceScale * 0.3,
          },
        ]}
      >
        <View style={[styles.markerIcon, { backgroundColor: signalQuality.color }]}>
          <Icon name="account-alert" size={24} color={COLORS.text} />
        </View>
        <View style={styles.markerInfo}>
          <Text style={styles.markerName} numberOfLines={1}>
            {beacon.deviceName}
          </Text>
          <Text style={styles.markerDistance}>
            {formatDistance(beacon.distance)}
          </Text>
          {beacon.batteryLevel <= 20 && (
            <View style={styles.markerBattery}>
              <Icon name="battery-alert" size={12} color={COLORS.danger} />
              <Text style={styles.markerBatteryText}>{beacon.batteryLevel}%</Text>
            </View>
          )}
        </View>
        <View style={styles.markerLine} />
      </View>
    );
  };

  const renderDirectionIndicator = () => {
    if (!selectedBeacon) return null;

    return (
      <View style={styles.directionIndicator}>
        <Icon name="navigation" size={40} color={COLORS.primary} />
        <Text style={styles.directionText}>
          {formatDistance(selectedBeacon.distance)} ahead
        </Text>
      </View>
    );
  };

  const renderAROverlay = () => (
    <View style={styles.arOverlay}>
      {detectedBeacons.slice(0, 5).map((beacon, index) => 
        renderBeaconMarker(beacon, index)
      )}
      
      {renderDirectionIndicator()}

      <View style={styles.compassOverlay}>
        <Icon name="compass" size={30} color={COLORS.text} />
        <Text style={styles.compassText}>N</Text>
      </View>

      <View style={styles.crosshair}>
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
      </View>
    </View>
  );

  const renderCameraPlaceholder = () => (
    <View style={styles.cameraPlaceholder}>
      <View style={styles.gridOverlay}>
        {[...Array(9)].map((_, i) => (
          <View key={i} style={styles.gridCell} />
        ))}
      </View>
      <Text style={styles.placeholderText}>Camera Preview</Text>
      <Text style={styles.placeholderSubtext}>
        AR markers will appear here
      </Text>
    </View>
  );

  const renderInfoPanel = () => (
    <View style={styles.infoPanel}>
      <View style={styles.infoPanelHeader}>
        <Text style={styles.infoPanelTitle}>AR Navigation</Text>
        <View style={styles.beaconCount}>
          <Icon name="broadcast" size={16} color={COLORS.primary} />
          <Text style={styles.beaconCountText}>
            {detectedBeacons.length} beacons
          </Text>
        </View>
      </View>

      {selectedBeacon && (
        <View style={styles.selectedBeaconInfo}>
          <Text style={styles.selectedLabel}>Tracking:</Text>
          <Text style={styles.selectedName}>{selectedBeacon.deviceName}</Text>
          <View style={styles.selectedStats}>
            <SignalStrength rssi={selectedBeacon.rssi} size="small" />
            <Text style={styles.selectedDistance}>
              {formatDistance(selectedBeacon.distance)}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.instructions}>
        <Icon name="information" size={16} color={COLORS.info} />
        <Text style={styles.instructionsText}>
          Point your camera towards the beacon location. Markers show victim positions.
        </Text>
      </View>
    </View>
  );

  if (!arEnabled) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.enableScreen}>
          <Icon name="camera-enhance" size={80} color={COLORS.textMuted} />
          <Text style={styles.enableTitle}>AR View</Text>
          <Text style={styles.enableText}>
            View beacon locations overlaid on your camera feed with 3D markers and distance labels.
          </Text>
          <TouchableOpacity style={styles.enableButton} onPress={handleEnableAR}>
            <Icon name="camera" size={24} color={COLORS.text} />
            <Text style={styles.enableButtonText}>Enable AR View</Text>
          </TouchableOpacity>
          <Text style={styles.enableNote}>
            Requires camera permission
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.arContainer}>
        {renderCameraPlaceholder()}
        {renderAROverlay()}
      </View>
      {renderInfoPanel()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  enableScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  enableTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 20,
  },
  enableText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 15,
    lineHeight: 24,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginTop: 30,
    gap: 10,
  },
  enableButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
  enableNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 15,
  },
  arContainer: {
    flex: 1,
    position: 'relative',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: '33.33%',
    height: '33.33%',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  placeholderText: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 5,
  },
  arOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  arMarker: {
    position: 'absolute',
    alignItems: 'center',
    width: 80,
  },
  markerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  markerInfo: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 5,
    alignItems: 'center',
  },
  markerName: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
  },
  markerDistance: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  markerBattery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  markerBatteryText: {
    fontSize: 10,
    color: COLORS.danger,
  },
  markerLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.primary,
    opacity: 0.5,
  },
  directionIndicator: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -50,
    alignItems: 'center',
  },
  directionText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  compassOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    alignItems: 'center',
  },
  compassText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -15,
    marginLeft: -15,
    width: 30,
    height: 30,
  },
  crosshairH: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  crosshairV: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  infoPanel: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoPanelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  beaconCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  beaconCountText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  selectedBeaconInfo: {
    backgroundColor: COLORS.backgroundLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  selectedLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
  },
  selectedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  selectedDistance: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionsText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});

export default ARViewScreen;
