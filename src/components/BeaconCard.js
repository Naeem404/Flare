/**
 * FLARE Beacon Card Component
 * Displays information about a detected SOS beacon
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SignalStrength from './SignalStrength';
import { COLORS } from '../utils/constants';
import { formatDistance, formatBatteryStatus, getSignalQuality } from '../utils/rssiCalculator';

const BeaconCard = ({ beacon, isSelected, onPress, onNavigate }) => {
  const batteryStatus = formatBatteryStatus(beacon.batteryLevel);
  const signalQuality = getSignalQuality(beacon.rssi);

  const getTimeSinceDetection = () => {
    if (!beacon.firstSeen) return '';
    const seconds = Math.floor((Date.now() - beacon.firstSeen) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.containerSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <View style={[styles.statusDot, { backgroundColor: signalQuality.color }]} />
          <Icon name="account-alert" size={28} color={COLORS.textPrimary} />
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.deviceName} numberOfLines={1}>
            {beacon.deviceName || 'Unknown Device'}
          </Text>
          <Text style={styles.deviceId}>
            ID: {beacon.deviceId.substring(0, 8)}...
          </Text>
        </View>

        {beacon.batteryLevel <= 20 && (
          <View style={styles.priorityBadge}>
            <Icon name="alert" size={14} color={COLORS.textPrimary} />
            <Text style={styles.priorityText}>Priority</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Icon name="map-marker-distance" size={20} color={COLORS.primary} />
          <Text style={styles.statValue}>{formatDistance(beacon.distance)}</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>

        <View style={styles.stat}>
          <SignalStrength rssi={beacon.rssi} size="small" showLabel={false} />
          <Text style={styles.statValue}>{beacon.rssi} dBm</Text>
          <Text style={styles.statLabel}>Signal</Text>
        </View>

        <View style={styles.stat}>
          <Icon
            name={batteryStatus.icon}
            size={20}
            color={batteryStatus.color}
          />
          <Text style={[styles.statValue, { color: batteryStatus.color }]}>
            {beacon.batteryLevel}%
          </Text>
          <Text style={styles.statLabel}>Battery</Text>
        </View>
      </View>

      {beacon.message && (
        <View style={styles.messageContainer}>
          <Icon name="message-text" size={16} color={COLORS.textSecondary} />
          <Text style={styles.messageText} numberOfLines={2}>
            {beacon.message}
          </Text>
        </View>
      )}

      {beacon.emergencyType && (
        <View style={styles.emergencyTag}>
          <Icon name="alert-circle" size={14} color={COLORS.warning} />
          <Text style={styles.emergencyText}>
            {beacon.emergencyType.charAt(0).toUpperCase() + beacon.emergencyType.slice(1)}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.timeText}>
          Detected {getTimeSinceDetection()}
        </Text>

        <TouchableOpacity
          style={styles.navigateButton}
          onPress={onNavigate}
        >
          <Icon name="navigation" size={18} color={COLORS.textPrimary} />
          <Text style={styles.navigateText}>Navigate</Text>
        </TouchableOpacity>
      </View>

      {isSelected && (
        <View style={styles.selectedIndicator}>
          <Icon name="check-circle" size={20} color={COLORS.info} />
          <Text style={styles.selectedText}>Tracking</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  containerSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.95,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  deviceId: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emergency,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 5,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.backgroundLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  emergencyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 6,
  },
  emergencyText: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  navigateText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
  },
});

export default BeaconCard;
