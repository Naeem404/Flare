/**
 * FLARE Manual Map Screen
 * Arrow-button based navigation for planning routes
 * Use this before entering the disaster zone to scout signal patterns
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
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import NavigationService from '../services/NavigationService';
import SignalStrength from '../components/SignalStrength';
import { COLORS } from '../utils/constants';

const { width } = Dimensions.get('window');
const GRID_CELL_SIZE = Math.floor((width - 40) / 7);

const ManualMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [enhancedNavState, setEnhancedNavState] = useState(null);
  const [lastGuidanceMessage, setLastGuidanceMessage] = useState('');
  const [moveCount, setMoveCount] = useState(0);
  
  const positionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Reset navigation service when screen loads
    NavigationService.reset();
    return () => {
      // Cleanup on unmount
    };
  }, []);

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
  }, [selectedBeacon, detectedBeacons]);

  const handlePositionUpdate = useCallback((dx, dy) => {
    const newX = positionRef.current.x + dx;
    const newY = positionRef.current.y + dy;
    positionRef.current = { x: newX, y: newY };
    setCurrentPosition({ x: newX, y: newY });
    setMoveCount(prev => prev + 1);

    // Get current beacon RSSI for navigation
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
            NavigationService.reset();
            positionRef.current = { x: 0, y: 0 };
            setCurrentPosition({ x: 0, y: 0 });
            setEnhancedNavState(null);
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
            color={guidance?.confidence > 0.5 ? COLORS.info : COLORS.warning}
          />
          <Text style={styles.navGuidanceText} numberOfLines={3}>
            {guidance?.message || 'Use arrows to simulate movement...'}
          </Text>
        </View>
      </View>
    );
  };

  const renderGrid = () => {
    const grid = enhancedNavState?.grid || [];
    
    // Generate default grid if empty
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
        return <Icon name="account" size={GRID_CELL_SIZE * 0.5} color={COLORS.text} />;
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

  const renderControls = () => (
    <View style={styles.controls}>
      <View style={styles.movementPad}>
        <TouchableOpacity
          style={styles.moveButton}
          onPress={() => handlePositionUpdate(0, -1)}
        >
          <Icon name="arrow-up" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.moveRow}>
          <TouchableOpacity
            style={styles.moveButton}
            onPress={() => handlePositionUpdate(-1, 0)}
          >
            <Icon name="arrow-left" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.centerIndicator}>
            <Text style={styles.moveCountText}>{moveCount}</Text>
          </View>
          <TouchableOpacity
            style={styles.moveButton}
            onPress={() => handlePositionUpdate(1, 0)}
          >
            <Icon name="arrow-right" size={28} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.moveButton}
          onPress={() => handlePositionUpdate(0, 1)}
        >
          <Icon name="arrow-down" size={28} color={COLORS.text} />
        </TouchableOpacity>
      </View>

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
      <View style={styles.legendItem}>
        <View style={[styles.legendColor, { backgroundColor: COLORS.heatMapUnknown }]} />
        <Text style={styles.legendText}>Unknown</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📍 Manual Map</Text>
        <Text style={styles.subtitle}>Use arrows to plan your route</Text>
      </View>

      {renderNavigationInfo()}

      <View style={styles.mapContainer}>
        {renderGrid()}
        
        {enhancedNavState && (
          <View style={styles.calibrationStatus}>
            <Text style={styles.calibrationText}>
              Explored: {enhancedNavState.exploredDirections}/8 directions
            </Text>
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
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  navInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
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
    minWidth: 70,
  },
  navDistanceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
  },
  navDistanceLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  navGuidance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginLeft: 12,
  },
  navGuidanceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  mapContainer: {
    flex: 1,
    margin: 12,
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
  calibrationStatus: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  calibrationText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.primary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: COLORS.surface,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  movementPad: {
    alignItems: 'center',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moveButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  centerIndicator: {
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 27,
  },
  moveCountText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    gap: 8,
  },
  resetButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});

export default ManualMapScreen;
