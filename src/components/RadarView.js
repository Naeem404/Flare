/**
 * FLARE Radar View Component
 * Circular radar display showing beacon positions
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { formatDistance, getSignalQuality } from '../utils/rssiCalculator';

const { width } = Dimensions.get('window');
const RADAR_SIZE = width - 40;
const RADAR_CENTER = RADAR_SIZE / 2;
const MAX_RANGE = 100;

const RadarView = ({ beacons, selectedBeacon, onSelectBeacon, isScanning }) => {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isScanning) {
      startSweepAnimation();
      startPulseAnimation();
    } else {
      sweepAnim.stopAnimation();
      pulseAnim.stopAnimation();
    }
  }, [isScanning]);

  const startSweepAnimation = () => {
    Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const getBeaconPosition = (beacon) => {
    const normalizedDistance = Math.min(beacon.distance / MAX_RANGE, 1);
    const radius = normalizedDistance * (RADAR_CENTER - 30);
    
    const angle = (beacon.deviceId.charCodeAt(0) * 137.5) % 360;
    const radians = (angle * Math.PI) / 180;
    
    return {
      x: RADAR_CENTER + radius * Math.cos(radians),
      y: RADAR_CENTER + radius * Math.sin(radians),
    };
  };

  const sweepRotation = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderRadarBackground = () => (
    <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={styles.radarSvg}>
      {[0.25, 0.5, 0.75, 1].map((ratio, index) => (
        <Circle
          key={index}
          cx={RADAR_CENTER}
          cy={RADAR_CENTER}
          r={(RADAR_CENTER - 20) * ratio}
          stroke={COLORS.border}
          strokeWidth={1}
          fill="none"
        />
      ))}
      
      {[0, 45, 90, 135].map((angle, index) => {
        const radians = (angle * Math.PI) / 180;
        const endX = RADAR_CENTER + (RADAR_CENTER - 20) * Math.cos(radians);
        const endY = RADAR_CENTER + (RADAR_CENTER - 20) * Math.sin(radians);
        const startX = RADAR_CENTER - (RADAR_CENTER - 20) * Math.cos(radians);
        const startY = RADAR_CENTER - (RADAR_CENTER - 20) * Math.sin(radians);
        
        return (
          <Line
            key={index}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={COLORS.border}
            strokeWidth={1}
          />
        );
      })}
      
      {[25, 50, 75, 100].map((distance, index) => (
        <SvgText
          key={index}
          x={RADAR_CENTER + 5}
          y={RADAR_CENTER - (RADAR_CENTER - 20) * ((index + 1) * 0.25) + 4}
          fill={COLORS.textMuted}
          fontSize={10}
        >
          {distance}m
        </SvgText>
      ))}
    </Svg>
  );

  const renderBeaconMarker = (beacon) => {
    const position = getBeaconPosition(beacon);
    const quality = getSignalQuality(beacon.rssi);
    const isSelected = selectedBeacon?.deviceId === beacon.deviceId;

    return (
      <TouchableOpacity
        key={beacon.deviceId}
        style={[
          styles.beaconMarker,
          {
            left: position.x - 20,
            top: position.y - 20,
          },
        ]}
        onPress={() => onSelectBeacon(beacon)}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.beaconDot,
            {
              backgroundColor: quality.color,
              borderColor: isSelected ? COLORS.text : 'transparent',
              transform: isSelected ? [{ scale: pulseAnim }] : [],
            },
          ]}
        >
          {beacon.batteryLevel <= 20 && (
            <View style={styles.priorityIndicator}>
              <Icon name="alert" size={10} color={COLORS.text} />
            </View>
          )}
        </Animated.View>
        <Text style={styles.beaconLabel} numberOfLines={1}>
          {formatDistance(beacon.distance)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.radarContainer}>
        {renderRadarBackground()}
        
        {isScanning && (
          <Animated.View
            style={[
              styles.sweepLine,
              {
                transform: [{ rotate: sweepRotation }],
              },
            ]}
          />
        )}
        
        <View style={styles.centerDot}>
          <Icon name="crosshairs" size={24} color={COLORS.primary} />
        </View>
        
        {beacons.map(renderBeaconMarker)}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.signalExcellent }]} />
          <Text style={styles.legendText}>Excellent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.signalGood }]} />
          <Text style={styles.legendText}>Good</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.signalFair }]} />
          <Text style={styles.legendText}>Fair</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.signalWeak }]} />
          <Text style={styles.legendText}>Weak</Text>
        </View>
      </View>

      {selectedBeacon && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selectedBeacon.deviceName}</Text>
          <Text style={styles.selectedDistance}>
            {formatDistance(selectedBeacon.distance)} away
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  radarContainer: {
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    borderRadius: RADAR_SIZE / 2,
    backgroundColor: COLORS.surface,
    position: 'relative',
    overflow: 'hidden',
  },
  radarSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  sweepLine: {
    position: 'absolute',
    top: RADAR_CENTER,
    left: RADAR_CENTER,
    width: RADAR_CENTER - 20,
    height: 2,
    backgroundColor: COLORS.primary,
    opacity: 0.6,
    transformOrigin: 'left center',
  },
  centerDot: {
    position: 'absolute',
    top: RADAR_CENTER - 12,
    left: RADAR_CENTER - 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beaconMarker: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  beaconDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beaconLabel: {
    fontSize: 10,
    color: COLORS.text,
    marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    gap: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  selectedInfo: {
    marginTop: 20,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectedDistance: {
    fontSize: 14,
    color: COLORS.primary,
    marginTop: 2,
  },
});

export default RadarView;
