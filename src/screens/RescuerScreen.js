/**
 * FLARE Rescuer Screen
 * Radar view for detecting and tracking SOS beacons
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import NavigationService from '../services/NavigationService';
import BeaconCard from '../components/BeaconCard';
import RadarView from '../components/RadarView';
import SignalStrength from '../components/SignalStrength';
import { COLORS, BEACON_MODES } from '../utils/constants';
import { formatDistance, getSignalQuality, getNavigationGuidance } from '../utils/rssiCalculator';

const { width } = Dimensions.get('window');

const RescuerScreen = ({ navigation }) => {
  const { currentMode, settings } = useApp();
  const {
    isScanning,
    detectedBeacons,
    selectedBeacon,
    startScanning,
    stopScanning,
    selectBeacon,
    clearBeacons,
    isBluetoothEnabled,
  } = useBluetooth();

  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [navigationData, setNavigationData] = useState(null);
  const [previousRssi, setPreviousRssi] = useState(null);
  
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isBluetoothEnabled) {
      handleStartScan();
    }

    return () => {
      stopScanning();
      NavigationService.reset();
    };
  }, []);

  useEffect(() => {
    if (isScanning) {
      startScanAnimation();
    } else {
      scanAnim.stopAnimation();
      scanAnim.setValue(0);
    }
  }, [isScanning]);

  useEffect(() => {
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        const navResult = NavigationService.processRSSIReading(beacon.rssi);
        setNavigationData(navResult);
        setPreviousRssi(beacon.rssi);
      }
    }
  }, [selectedBeacon, detectedBeacons]);

  const startScanAnimation = () => {
    Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  };

  const handleStartScan = async () => {
    try {
      await startScanning(currentMode || BEACON_MODES.PUBLIC);
    } catch (error) {
      console.error('Start scan error:', error);
      Alert.alert('Scan Error', 'Failed to start scanning. Please check Bluetooth permissions.');
    }
  };

  const handleStopScan = () => {
    stopScanning();
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    clearBeacons();
    await handleStartScan();
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleSelectBeacon = (beacon) => {
    selectBeacon(beacon);
    NavigationService.setTargetBeacon(beacon);
    NavigationService.setEnvironmentFactor(settings.environmentFactor);
  };

  const handleNavigateToBeacon = (beacon) => {
    handleSelectBeacon(beacon);
    navigation.navigate('HeatMap', { beacon });
  };

  const sortedBeacons = [...detectedBeacons].sort((a, b) => {
    if (a.batteryLevel <= 20 && b.batteryLevel > 20) return -1;
    if (b.batteryLevel <= 20 && a.batteryLevel > 20) return 1;
    return a.distance - b.distance;
  });

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.title}>FLARE Scanner</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.viewToggle}
            onPress={() => setViewMode(viewMode === 'list' ? 'radar' : 'list')}
          >
            <Icon
              name={viewMode === 'list' ? 'radar' : 'format-list-bulleted'}
              size={24}
              color={COLORS.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonActive]}
            onPress={isScanning ? handleStopScan : handleStartScan}
          >
            <Animated.View
              style={[
                styles.scanButtonInner,
                isScanning && {
                  transform: [{
                    rotate: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  }],
                },
              ]}
            >
              <Icon
                name={isScanning ? 'radar' : 'play'}
                size={20}
                color={COLORS.textPrimary}
              />
            </Animated.View>
            <Text style={styles.scanButtonText}>
              {isScanning ? 'Scanning...' : 'Scan'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{detectedBeacons.length}</Text>
          <Text style={styles.statLabel}>Beacons Found</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {detectedBeacons.filter(b => b.batteryLevel <= 20).length}
          </Text>
          <Text style={[styles.statLabel, { color: COLORS.warning }]}>Low Battery</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {detectedBeacons.length > 0
              ? formatDistance(Math.min(...detectedBeacons.map(b => b.distance)))
              : '--'}
          </Text>
          <Text style={styles.statLabel}>Nearest</Text>
        </View>
      </View>
    </View>
  );

  const renderSelectedBeaconNav = () => {
    if (!selectedBeacon || !navigationData) return null;

    const guidance = getNavigationGuidance(navigationData.rssi, previousRssi);

    return (
      <View style={styles.navigationPanel}>
        <View style={styles.navHeader}>
          <Text style={styles.navTitle}>Navigating to: {selectedBeacon.deviceName}</Text>
          <TouchableOpacity onPress={() => selectBeacon(null)}>
            <Icon name="close" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.navContent}>
          <View style={styles.distanceDisplay}>
            <Text style={styles.distanceValue}>{navigationData.formattedDistance}</Text>
            <Text style={styles.distanceLabel}>estimated distance</Text>
          </View>

          <SignalStrength rssi={navigationData.rssi} size="large" />

          <View style={styles.guidanceBox}>
            <Icon
              name={guidance.direction === 'closer' ? 'arrow-up-bold' :
                    guidance.direction === 'farther' ? 'arrow-down-bold' :
                    'minus'}
              size={32}
              color={guidance.direction === 'closer' ? COLORS.success :
                     guidance.direction === 'farther' ? COLORS.danger :
                     COLORS.warning}
            />
            <Text style={styles.guidanceText}>{guidance.message}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="radar" size={80} color={COLORS.textMuted} />
      <Text style={styles.emptyTitle}>No Beacons Detected</Text>
      <Text style={styles.emptyText}>
        {isScanning
          ? 'Scanning for SOS beacons in range...'
          : 'Tap "Scan" to search for nearby SOS beacons'}
      </Text>
      {!isScanning && (
        <TouchableOpacity style={styles.emptyButton} onPress={handleStartScan}>
          <Icon name="magnify" size={20} color={COLORS.textPrimary} />
          <Text style={styles.emptyButtonText}>Start Scanning</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderSelectedBeaconNav()}

      {viewMode === 'radar' ? (
        <RadarView
          beacons={sortedBeacons}
          selectedBeacon={selectedBeacon}
          onSelectBeacon={handleSelectBeacon}
          isScanning={isScanning}
        />
      ) : (
        <FlatList
          data={sortedBeacons}
          keyExtractor={(item) => item.deviceId}
          renderItem={({ item }) => (
            <BeaconCard
              beacon={item}
              isSelected={selectedBeacon?.deviceId === item.deviceId}
              onPress={() => handleSelectBeacon(item)}
              onNavigate={() => handleNavigateToBeacon(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.surface}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewToggle: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    gap: 8,
  },
  scanButtonActive: {
    backgroundColor: COLORS.success,
  },
  scanButtonInner: {},
  scanButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  navigationPanel: {
    backgroundColor: COLORS.surface,
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  navContent: {
    alignItems: 'center',
    gap: 15,
  },
  distanceDisplay: {
    alignItems: 'center',
  },
  distanceValue: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.primary,
  },
  distanceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: 15,
    borderRadius: 10,
    gap: 10,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  guidanceText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  listContent: {
    padding: 10,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    marginTop: 20,
    gap: 10,
  },
  emptyButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default RescuerScreen;
