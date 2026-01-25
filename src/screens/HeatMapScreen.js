/**
 * FLARE HeatMap Screen
 * 2D visualization of signal strength and obstacles
 * Enhanced with hot/cold navigation and obstacle detection
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
import HeatMapService from '../services/HeatMapService';
import NavigationService from '../services/NavigationService';
import SignalStrength from '../components/SignalStrength';
import { COLORS, HEAT_MAP_CONFIG } from '../utils/constants';
import { formatDistance, getNavigationGuidance } from '../utils/rssiCalculator';

const { width, height } = Dimensions.get('window');
const GRID_CELL_SIZE = Math.floor((width - 40) / 7); // 7x7 grid

const HeatMapScreen = ({ navigation, route }) => {
  const { settings } = useApp();
  const { selectedBeacon, detectedBeacons, isScanning } = useBluetooth();
  
  const [gridData, setGridData] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [navigationData, setNavigationData] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [suggestedPath, setSuggestedPath] = useState(null);
  const [enhancedNavState, setEnhancedNavState] = useState(null);
  const [lastGuidanceMessage, setLastGuidanceMessage] = useState('');
  
  const positionRef = useRef({ x: 0, y: 0 });
  const updateIntervalRef = useRef(null);
  const lastRssiRef = useRef(null);

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

    // Get current beacon RSSI for enhanced navigation
    if (selectedBeacon) {
      const beacon = detectedBeacons.find(b => b.deviceId === selectedBeacon.deviceId);
      if (beacon) {
        // Record movement with signal reading for hot/cold navigation
        const guidance = NavigationService.recordMovement(
          { dx: Math.sign(dx), dy: Math.sign(dy) },
          { x: newX, y: newY },
          beacon.rssi
        );
        
        if (guidance) {
          // Update enhanced navigation state
          const fullState = NavigationService.getFullNavigationState();
          setEnhancedNavState(fullState);
          
          // Vibrate on state changes
          if (guidance.hotColdState === 'getting_warmer' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate(100); // Short vibrate for warmer
          } else if (guidance.hotColdState === 'getting_colder' && lastGuidanceMessage !== guidance.message) {
            Vibration.vibrate([0, 50, 50, 50]); // Double vibrate for colder
          }
          
          setLastGuidanceMessage(guidance.message);
        }
      }
    }
  }, [selectedBeacon, detectedBeacons, lastGuidanceMessage]);

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
    if (!selectedBeacon) return null;

    const navState = enhancedNavState || NavigationService.getFullNavigationState();
    const guidance = navState?.guidance;

    // Get hot/cold background color
    const getHotColdColor = () => {
      if (!guidance) return COLORS.surface;
      switch (guidance.hotColdState) {
        case 'getting_warmer': return 'rgba(255, 87, 34, 0.3)'; // Orange/warm
        case 'getting_colder': return 'rgba(33, 150, 243, 0.3)'; // Blue/cold
        case 'stable': return 'rgba(255, 193, 7, 0.2)'; // Yellow
        default: return COLORS.surface;
      }
    };

    return (
      <View style={[styles.navInfo, { backgroundColor: getHotColdColor() }]}>
        <View style={styles.navDistance}>
          <Text style={styles.navDistanceValue}>
            {guidance?.distance || '--'}
          </Text>
          <Text style={styles.navDistanceLabel}>to victim</Text>
        </View>
        
        {navState?.rssi && (
          <SignalStrength rssi={navState.rssi} size="small" />
        )}
        
        <View style={styles.navGuidance}>
          <Icon
            name={guidance?.icon || 'compass'}
            size={24}
            color={guidance?.confidence > 0.5 ? COLORS.secondary : COLORS.warning}
          />
          <Text style={styles.navGuidanceText} numberOfLines={3}>
            {guidance?.message || 'Move around to calibrate...'}
          </Text>
        </View>
      </View>
    );
  };

  // Render the enhanced direction grid
  const renderDirectionGrid = () => {
    const navState = enhancedNavState || NavigationService.getFullNavigationState();
    const grid = navState?.grid || [];

    if (grid.length === 0) {
      // Generate empty 7x7 grid
      const emptyGrid = [];
      for (let y = 0; y < 7; y++) {
        const row = [];
        for (let x = 0; x < 7; x++) {
          row.push({
            x: x - 3,
            y: y - 3,
            status: 'unknown',
            isRescuer: x === 3 && y === 3,
          });
        }
        emptyGrid.push(row);
      }
      return renderGrid(emptyGrid);
    }

    return renderGrid(grid);
  };

  const renderGrid = (grid) => {
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
        {grid.map((row, rowIndex) => (
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

  const renderMapSelector = () => (
    <View style={styles.mapSelector}>
      <Text style={styles.mapSelectorTitle}>Choose Navigation Mode:</Text>
      
      {/* Featured: Radar Map */}
      <TouchableOpacity 
        style={styles.featuredMapButton}
        onPress={() => navigation.navigate('RadarMap')}
      >
        <Icon name="radar" size={40} color={COLORS.text} />
        <View style={styles.featuredMapInfo}>
          <Text style={styles.featuredMapTitle}>🎯 Radar Map (Recommended)</Text>
          <Text style={styles.featuredMapDesc}>
            Real-time scrolling • Rotation tracking • Visual movement feedback
          </Text>
        </View>
      </TouchableOpacity>
      
      <Text style={styles.otherMapsLabel}>Other Options:</Text>
      <View style={styles.mapButtons}>
        <TouchableOpacity 
          style={styles.mapButton}
          onPress={() => navigation.navigate('ManualMap')}
        >
          <Icon name="gesture-tap" size={28} color={COLORS.text} />
          <Text style={styles.mapButtonTitle}>📍 Manual</Text>
          <Text style={styles.mapButtonDesc}>Arrow buttons</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.mapButton}
          onPress={() => navigation.navigate('LiveMap')}
        >
          <Icon name="walk" size={28} color={COLORS.text} />
          <Text style={styles.mapButtonTitle}>🚶 Live</Text>
          <Text style={styles.mapButtonDesc}>Auto-tracking</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.mapButton}
          onPress={() => navigation.navigate('CombinedMap')}
        >
          <Icon name="swap-horizontal" size={28} color={COLORS.text} />
          <Text style={styles.mapButtonTitle}>🗺️ Combined</Text>
          <Text style={styles.mapButtonDesc}>Both modes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🗺️ Navigation Maps</Text>
        {selectedBeacon ? (
          <Text style={styles.subtitle}>
            Tracking: {selectedBeacon.deviceName}
          </Text>
        ) : (
          <Text style={styles.subtitleWarning}>
            ⚠️ Select a beacon from Radar tab first
          </Text>
        )}
      </View>

      {renderMapSelector()}

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How to Use:</Text>
        <View style={styles.infoItem}>
          <Icon name="numeric-1-circle" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>Go to Radar tab and select a victim beacon</Text>
        </View>
        <View style={styles.infoItem}>
          <Icon name="numeric-2-circle" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>Choose a navigation mode above</Text>
        </View>
        <View style={styles.infoItem}>
          <Icon name="numeric-3-circle" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>Follow the hot/cold guidance to find victim</Text>
        </View>
      </View>

      {renderLegend()}
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
  subtitleWarning: {
    fontSize: 14,
    color: COLORS.warning,
    marginTop: 5,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 15,
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
    fontSize: 11,
    color: COLORS.textSecondary,
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
  calibrationStatus: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  calibrationText: {
    fontSize: 12,
    color: COLORS.text,
  },
  calibrationHint: {
    fontSize: 11,
    color: COLORS.warning,
    marginTop: 2,
  },
  mapSelector: {
    padding: 15,
  },
  mapSelectorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  featuredMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    gap: 12,
  },
  featuredMapInfo: {
    flex: 1,
  },
  featuredMapTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  featuredMapDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  otherMapsLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  mapButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  mapButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapButtonTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 6,
  },
  mapButtonDesc: {
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  infoSection: {
    backgroundColor: COLORS.surface,
    margin: 15,
    padding: 15,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
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
