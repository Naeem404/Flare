/**
 * FLARE HeatMap Screen
 * 2D visualization of signal strength and obstacles
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
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import HeatMapService from '../services/HeatMapService';
import NavigationService from '../services/NavigationService';
import HeatMapCanvas from '../components/HeatMapCanvas';
import SignalStrength from '../components/SignalStrength';
import { COLORS, HEAT_MAP_CONFIG } from '../utils/constants';
import { formatDistance, getNavigationGuidance } from '../utils/rssiCalculator';

const { width, height } = Dimensions.get('window');

const HeatMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  
  const [gridData, setGridData] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [navigationData, setNavigationData] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [suggestedPath, setSuggestedPath] = useState(null);
  
  const positionRef = useRef({ x: 0, y: 0 });
  const updateIntervalRef = useRef(null);

  useEffect(() => {
    HeatMapService.initialize(HEAT_MAP_CONFIG.GRID_SIZE);
    
    HeatMapService.onGridUpdate = (grid) => {
      setGridData(grid);
      setStatistics(HeatMapService.getStatistics());
    };

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      HeatMapService.reset();
    };
  }, []);

  useEffect(() => {
    if (isRecording && selectedBeacon) {
      startRecording();
    } else {
      stopRecording();
    }

    return () => stopRecording();
  }, [isRecording, selectedBeacon]);

  useEffect(() => {
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        const navResult = NavigationService.processRSSIReading(beacon.rssi, currentPosition);
        setNavigationData(navResult);

        if (isRecording) {
          HeatMapService.recordReading(
            currentPosition.x,
            currentPosition.y,
            beacon.rssi
          );
        }
      }
    }
  }, [selectedBeacon, detectedBeacons, currentPosition]);

  const startRecording = () => {
    updateIntervalRef.current = setInterval(() => {
      const path = HeatMapService.getSuggestedPath();
      setSuggestedPath(path);
    }, 2000);
  };

  const stopRecording = () => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
  };

  const handlePositionUpdate = useCallback((dx, dy) => {
    const newX = positionRef.current.x + dx;
    const newY = positionRef.current.y + dy;
    positionRef.current = { x: newX, y: newY };
    setCurrentPosition({ x: newX, y: newY });
    HeatMapService.updateRescuerPosition(newX, newY);
  }, []);

  const handleToggleRecording = () => {
    if (!selectedBeacon) {
      Alert.alert('No Beacon Selected', 'Please select a beacon to track first.');
      return;
    }
    setIsRecording(!isRecording);
  };

  const handleResetMap = () => {
    Alert.alert(
      'Reset Heat Map?',
      'This will clear all recorded data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            HeatMapService.reset();
            setGridData([]);
            setStatistics(null);
            setSuggestedPath(null);
            positionRef.current = { x: 0, y: 0 };
            setCurrentPosition({ x: 0, y: 0 });
          },
        },
      ]
    );
  };

  const renderLegend = () => (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapClear }]} />
        <Text style={styles.legendText}>Clear</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapUnstable }]} />
        <Text style={styles.legendText}>Unstable</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapObstacle }]} />
        <Text style={styles.legendText}>Obstacle</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapUnknown }]} />
        <Text style={styles.legendText}>Unknown</Text>
      </View>
    </View>
  );

  const renderControls = () => (
    <View style={styles.controls}>
      <View style={styles.movementPad}>
        <TouchableOpacity
          style={styles.moveButton}
          onPress={() => handlePositionUpdate(0, -HEAT_MAP_CONFIG.GRID_SIZE)}
        >
          <Icon name="arrow-up" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.moveRow}>
          <TouchableOpacity
            style={styles.moveButton}
            onPress={() => handlePositionUpdate(-HEAT_MAP_CONFIG.GRID_SIZE, 0)}
          >
            <Icon name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.centerIndicator}>
            <Icon name="crosshairs" size={20} color={COLORS.primary} />
          </View>
          <TouchableOpacity
            style={styles.moveButton}
            onPress={() => handlePositionUpdate(HEAT_MAP_CONFIG.GRID_SIZE, 0)}
          >
            <Icon name="arrow-right" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.moveButton}
          onPress={() => handlePositionUpdate(0, HEAT_MAP_CONFIG.GRID_SIZE)}
        >
          <Icon name="arrow-down" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, isRecording && styles.actionButtonActive]}
          onPress={handleToggleRecording}
        >
          <Icon
            name={isRecording ? 'stop' : 'record'}
            size={20}
            color={COLORS.text}
          />
          <Text style={styles.actionButtonText}>
            {isRecording ? 'Stop' : 'Record'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleResetMap}>
          <Icon name="refresh" size={20} color={COLORS.text} />
          <Text style={styles.actionButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStats = () => {
    if (!statistics) return null;

    return (
      <View style={styles.statsPanel}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{statistics.totalCells}</Text>
          <Text style={styles.statLabel}>Cells</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLORS.heatMapClear }]}>
            {statistics.clearCells}
          </Text>
          <Text style={styles.statLabel}>Clear</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLORS.heatMapObstacle }]}>
            {statistics.obstacleCells}
          </Text>
          <Text style={styles.statLabel}>Blocked</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {statistics.avgSignalStrength ? `${statistics.avgSignalStrength} dBm` : '--'}
          </Text>
          <Text style={styles.statLabel}>Avg Signal</Text>
        </View>
      </View>
    );
  };

  const renderNavigationInfo = () => {
    if (!navigationData || !selectedBeacon) return null;

    const guidance = NavigationService.suggestDirection();

    return (
      <View style={styles.navInfo}>
        <View style={styles.navDistance}>
          <Text style={styles.navDistanceValue}>{navigationData.formattedDistance}</Text>
          <Text style={styles.navDistanceLabel}>to victim</Text>
        </View>
        <SignalStrength rssi={navigationData.rssi} size="small" />
        <View style={styles.navGuidance}>
          <Icon
            name={guidance.icon}
            size={24}
            color={guidance.confidence > 0.5 ? COLORS.secondary : COLORS.warning}
          />
          <Text style={styles.navGuidanceText} numberOfLines={2}>
            {guidance.suggestion}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Heat Map Navigator</Text>
        {selectedBeacon && (
          <Text style={styles.subtitle}>
            Tracking: {selectedBeacon.deviceName}
          </Text>
        )}
      </View>

      {renderLegend()}
      {renderNavigationInfo()}

      <View style={styles.mapContainer}>
        <HeatMapCanvas
          gridData={gridData}
          currentPosition={currentPosition}
          victimPosition={selectedBeacon ? { x: 20, y: 20 } : null}
          suggestedPath={suggestedPath}
          cellSize={30}
        />
      </View>

      {renderStats()}
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  navInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: COLORS.surface,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 12,
  },
  navDistance: {
    alignItems: 'center',
  },
  navDistanceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  navDistanceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  navGuidance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginLeft: 15,
  },
  navGuidanceText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  mapContainer: {
    flex: 1,
    margin: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 15,
    backgroundColor: COLORS.surface,
    marginHorizontal: 10,
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  movementPad: {
    alignItems: 'center',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  centerIndicator: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  actionButtonActive: {
    backgroundColor: COLORS.danger,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: '600',
  },
});

export default HeatMapScreen;
