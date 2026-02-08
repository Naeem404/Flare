/**
 * FLARE Group Screen
 * Private group management for family/friends with offline/Bluetooth support
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
  Share,
  Clipboard,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import SupabaseService from '../services/SupabaseService';
import { COLORS, BEACON_MODES, BEACON_STATUS } from '../utils/constants';
import { formatDistance, getSignalQuality } from '../utils/rssiCalculator';

const { width } = Dimensions.get('window');

// Generate random 6-character code
const generateGroupCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Format time since last seen
const formatTimeSince = (timestamp) => {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
};

const GroupScreen = ({ navigation }) => {
  const { privateGroups, joinGroup, leaveGroup, setMode, deviceId } = useApp();
  const { startScanning, stopScanning, startAdvertising, stopAdvertising, detectedBeacons, selectBeacon } = useBluetooth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState({});
  const [activeScanGroupId, setActiveScanGroupId] = useState(null);
  const [activeSosGroupId, setActiveSosGroupId] = useState(null);
  const [checkInTimestamps, setCheckInTimestamps] = useState({});

  // Initialize app
  useEffect(() => {
    loadLocalGroups();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
      stopAdvertising();
    };
  }, []);

  // Handle detected beacons for active group scanning
  useEffect(() => {
    if (activeScanGroupId) {
      updateGroupMembers();
    }
  }, [detectedBeacons, activeScanGroupId]);

  // Load groups from AsyncStorage
  const loadLocalGroups = async () => {
    try {
      const saved = await AsyncStorage.getItem('flare_groups');
      if (saved) {
        const groups = JSON.parse(saved);
        // Initialize groupMembers state
        const members = {};
        groups.forEach(group => {
          members[group.id] = group.members || [];
        });
        setGroupMembers(members);
      }
    } catch (error) {
      console.error('Load groups error:', error);
    }
  };

  // Update group members from detected beacons
  const updateGroupMembers = useCallback(() => {
    if (!activeScanGroupId) return;

    const groupBeacons = detectedBeacons.filter(beacon => beacon.groupId === activeScanGroupId);

    setGroupMembers(prev => ({
      ...prev,
      [activeScanGroupId]: groupBeacons.map(beacon => ({
        deviceId: beacon.deviceId,
        deviceName: beacon.deviceName,
        lastSeen: beacon.lastSeen,
        rssi: beacon.rssi,
        distance: beacon.distance,
        status: beacon.sosActive ? 'SOS' : (beacon.checkInActive ? 'OK' : 'Offline'),
        batteryLevel: beacon.batteryLevel,
      })),
    }));
  }, [activeScanGroupId, detectedBeacons]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setIsLoading(true);
    try {
      // Generate code locally
      const code = generateGroupCode();
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const group = {
        id: groupId,
        name: groupName.trim(),
        code,
        createdBy: deviceId,
        createdAt: new Date().toISOString(),
        members: [{ deviceId, role: 'creator', joinedAt: new Date().toISOString() }],
      };

      // Save locally first
      const existingGroups = privateGroups || [];
      const updatedGroups = [...existingGroups, group];
      await AsyncStorage.setItem('flare_groups', JSON.stringify(updatedGroups));

      await joinGroup(group);
      setGroupName('');
      setShowCreateModal(false);

      Alert.alert(
        'Group Created!',
        `Share this code with your group BEFORE going offline:\n\n${group.code}\n\nThey can use this code to join your group.`,
        [
          {
            text: 'Copy Code',
            onPress: () => Clipboard.setString(group.code),
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('Create group error:', error);
      Alert.alert('Error', 'Failed to create group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!joinCode.trim() || joinCode.trim().length < 6) {
      Alert.alert('Error', 'Please enter a valid 6-character group code');
      return;
    }

    setIsLoading(true);
    try {
      // Search locally first
      const code = joinCode.trim().toUpperCase();
      const foundGroup = privateGroups.find(g => g.code === code);

      if (!foundGroup) {
        Alert.alert('Error', 'Group code not found. Verify the code and try again.');
        setIsLoading(false);
        return;
      }

      // Add self as member
      const updatedGroup = {
        ...foundGroup,
        members: [
          ...(foundGroup.members || []),
          { deviceId, role: 'member', joinedAt: new Date().toISOString() },
        ],
      };

      // Update locally
      const updated = privateGroups.map(g => g.id === foundGroup.id ? updatedGroup : g);
      await AsyncStorage.setItem('flare_groups', JSON.stringify(updated));

      await joinGroup(updatedGroup);
      setJoinCode('');
      setShowJoinModal(false);

      Alert.alert('Success', `You've joined "${foundGroup.name}"!`);
    } catch (error) {
      console.error('Join group error:', error);
      Alert.alert('Error', error.message || 'Failed to join group. Check the code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveGroup = (group) => {
    Alert.alert(
      'Leave Group?',
      `Are you sure you want to leave "${group.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveGroup(group.id);
            // Clear from AsyncStorage
            const updated = privateGroups.filter(g => g.id !== group.id);
            await AsyncStorage.setItem('flare_groups', JSON.stringify(updated));
          },
        },
      ]
    );
  };

  const handleShareCode = async (group) => {
    try {
      await Share.share({
        message: `Join my FLARE emergency group!\n\nGroup: ${group.name}\nCode: ${group.code}\n\nDownload FLARE and use this code to join.`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleActivateGroupSOS = async (group) => {
    try {
      setActiveSosGroupId(group.id);
      await startAdvertising({
        mode: 'private',
        groupId: group.id,
        status: BEACON_STATUS.ACTIVE,
        sosActive: true,
        batteryLevel: 100,
      });
      setMode(BEACON_MODES.PRIVATE);
      navigation.navigate('Victim', { groupId: group.id });
    } catch (error) {
      console.error('SOS activation error:', error);
      Alert.alert('Error', 'Failed to send group SOS. Please try again.');
    }
  };

  const handleStartGroupScan = async (group) => {
    try {
      setActiveScanGroupId(group.id);
      setSelectedGroup(group);
      await startScanning('private', group.id);
    } catch (error) {
      console.error('Scan start error:', error);
      Alert.alert('Error', 'Failed to start scanning. Please try again.');
    }
  };

  const handleStopGroupScan = async () => {
    try {
      await stopScanning();
      setActiveScanGroupId(null);
      setSelectedGroup(null);
    } catch (error) {
      console.error('Scan stop error:', error);
    }
  };

  const handleSendCheckIn = async (group) => {
    try {
      await startAdvertising({
        mode: 'private',
        groupId: group.id,
        status: BEACON_STATUS.ACTIVE,
        checkInActive: true,
        batteryLevel: 100,
      });

      // Record check-in timestamp
      setCheckInTimestamps(prev => ({
        ...prev,
        [group.id]: Date.now(),
      }));

      Alert.alert('Check-in Sent', "Your group has been notified you're OK");

      // Auto-stop advertising check-in after 5 seconds
      setTimeout(() => {
        stopAdvertising();
      }, 5000);
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to send check-in. Please try again.');
    }
  };

  const handleNavigateToMember = (beacon) => {
    selectBeacon(beacon);
    setMode(BEACON_MODES.PRIVATE);
    navigation.navigate('HeatMap', { fromGroup: true });
  };

  const renderMemberCard = ({ item: member }) => {
    const isInRange = member.deviceId !== deviceId;
    const statusColor =
      member.status === 'SOS' ? COLORS.emergency :
      member.status === 'OK' ? COLORS.success :
      COLORS.textMuted;
    const signalQuality = member.rssi ? getSignalQuality(member.rssi) : null;

    return (
      <View style={[styles.memberCard, !isInRange && styles.memberCardOffline]}>
        <View style={styles.memberHeader}>
          <View style={[styles.memberStatusDot, { backgroundColor: statusColor }]} />
          <View style={styles.memberInfo}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.deviceName || 'Unknown Device'}
            </Text>
            <Text style={styles.memberTime}>
              {formatTimeSince(member.lastSeen)}
            </Text>
          </View>
        </View>

        {member.status === 'SOS' && (
          <TouchableOpacity
            style={styles.navigateButtonSmall}
            onPress={() => handleNavigateToMember(member)}
          >
            <Icon name="map-marker" size={16} color={COLORS.textPrimary} />
            <Text style={styles.navigateButtonText}>Navigate</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderGroupDetails = () => {
    if (!selectedGroup) return null;

    const members = groupMembers[selectedGroup.id] || [];
    const sosList = members.filter(m => m.status === 'SOS');
    const okList = members.filter(m => m.status === 'OK');
    const offlineList = members.filter(m => m.status === 'Offline');

    // Sort: SOS first, then by distance, then by last seen
    const sortedMembers = [
      ...sosList.sort((a, b) => (a.distance || 999) - (b.distance || 999)),
      ...okList.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)),
      ...offlineList.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)),
    ];

    return (
      <View style={styles.detailsContainer}>
        <View style={styles.detailsHeader}>
          <TouchableOpacity onPress={handleStopGroupScan} style={styles.closeButton}>
            <Icon name="close" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.detailsTitle}>{selectedGroup.name}</Text>
          <View style={styles.memberCount}>
            <Text style={styles.memberCountText}>{sortedMembers.length}</Text>
          </View>
        </View>

        <View style={styles.scanStatusContainer}>
          <Icon name="broadcast" size={16} color={COLORS.success} />
          <Text style={styles.scanStatusText}>Scanning for members...</Text>
        </View>

        <FlatList
          data={sortedMembers}
          keyExtractor={(item) => item.deviceId}
          renderItem={renderMemberCard}
          contentContainerStyle={styles.membersList}
          scrollEnabled={false}
        />

        <View style={styles.detailsActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.checkInButton]}
            onPress={() => handleSendCheckIn(selectedGroup)}
          >
            <Icon name="check-circle" size={20} color={COLORS.text} />
            <Text style={styles.actionButtonText}>I'm OK</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.sosButton]}
            onPress={() => handleActivateGroupSOS(selectedGroup)}
          >
            <Icon name="alert-circle" size={20} color={COLORS.text} />
            <Text style={styles.actionButtonText}>Send SOS</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroupCard = ({ item: group }) => {
    const memberCount = group.members ? group.members.length : 1;
    const isScanActive = activeScanGroupId === group.id;

    return (
      <View style={[styles.groupCard, isScanActive && styles.groupCardActive]}>
        <View style={styles.groupHeader}>
          <View style={styles.groupIcon}>
            <Icon name="account-group" size={24} color={COLORS.text} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName}>{group.name}</Text>
            <View style={styles.groupCode}>
              <Text style={styles.groupCodeLabel}>Code: </Text>
              <Text style={styles.groupCodeValue}>{group.code}</Text>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setString(group.code);
                  Alert.alert('Copied', 'Group code copied to clipboard');
                }}
              >
                <Icon name="content-copy" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.memberBadge}>
              <Icon name="account-multiple" size={14} color={COLORS.primary} />
              <Text style={styles.memberBadgeText}>{memberCount} members</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => handleShareCode(group)}
          >
            <Icon name="share-variant" size={20} color={COLORS.info} />
          </TouchableOpacity>
        </View>

        {isScanActive ? (
          <View style={styles.scanActiveIndicator}>
            <Icon name="broadcast" size={16} color={COLORS.success} />
            <Text style={styles.scanActiveText}>Scanning active</Text>
          </View>
        ) : null}

        <View style={styles.groupActions}>
          <TouchableOpacity
            style={[styles.groupAction, styles.checkInAction]}
            onPress={() => handleSendCheckIn(group)}
          >
            <Icon name="check-circle" size={20} color={COLORS.text} />
            <Text style={styles.groupActionText}>Check In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.groupAction, styles.sosAction]}
            onPress={() => handleActivateGroupSOS(group)}
          >
            <Icon name="alert-circle" size={20} color={COLORS.text} />
            <Text style={styles.groupActionText}>Send SOS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.groupAction, styles.scanAction, isScanActive && styles.scanActionActive]}
            onPress={() => isScanActive ? handleStopGroupScan() : handleStartGroupScan(group)}
          >
            <Icon name={isScanActive ? 'stop-circle' : 'radar'} size={20} color={COLORS.text} />
            <Text style={styles.groupActionText}>{isScanActive ? 'Stop' : 'Scan'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.leaveButton}
          onPress={() => handleLeaveGroup(group)}
        >
          <Icon name="exit-to-app" size={16} color={COLORS.danger} />
          <Text style={styles.leaveButtonText}>Leave Group</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCreateModal = () => (
    <View style={styles.modal}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Create New Group</Text>
        <Text style={styles.modalDescription}>
          Create a private group for your family or friends. Share the code to let them join.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Group Name (e.g., Family, Hiking Team)"
          placeholderTextColor={COLORS.textMuted}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.modalCancel}
            onPress={() => {
              setShowCreateModal(false);
              setGroupName('');
            }}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalConfirm, isLoading && styles.modalConfirmDisabled]}
            onPress={handleCreateGroup}
            disabled={isLoading}
          >
            <Text style={styles.modalConfirmText}>
              {isLoading ? 'Creating...' : 'Create Group'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderJoinModal = () => (
    <View style={styles.modal}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Join a Group</Text>
        <Text style={styles.modalDescription}>
          Enter the 6-character code shared by the group creator.
        </Text>

        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder="XXXXXX"
          placeholderTextColor={COLORS.textMuted}
          value={joinCode}
          onChangeText={(text) => setJoinCode(text.toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
        />

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.modalCancel}
            onPress={() => {
              setShowJoinModal(false);
              setJoinCode('');
            }}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalConfirm, isLoading && styles.modalConfirmDisabled]}
            onPress={handleJoinGroup}
            disabled={isLoading}
          >
            <Text style={styles.modalConfirmText}>
              {isLoading ? 'Joining...' : 'Join Group'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="account-group-outline" size={80} color={COLORS.textMuted} />
      <Text style={styles.emptyTitle}>No Groups Yet</Text>
      <Text style={styles.emptyText}>
        Create a private group for your family or friends, or join an existing group with a code.
      </Text>
    </View>
  );

  const renderOfflineIndicator = () => (
    <View style={styles.offlineIndicator}>
      <View style={styles.offlineIndicatorDot} />
      <Text style={styles.offlineIndicatorText}>Offline Mode — Using Bluetooth Only</Text>
      <Text style={styles.offlineSubText}>Members must be within ~100m</Text>
    </View>
  );

  if (selectedGroup) {
    return (
      <SafeAreaView style={styles.container}>
        {(showCreateModal || showJoinModal) && (
          <View style={styles.modalOverlay}>
            {showCreateModal && renderCreateModal()}
            {showJoinModal && renderJoinModal()}
          </View>
        )}
        {renderGroupDetails()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {(showCreateModal || showJoinModal) && (
        <View style={styles.modalOverlay}>
          {showCreateModal && renderCreateModal()}
          {showJoinModal && renderJoinModal()}
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>Private Groups</Text>
        <Text style={styles.subtitle}>
          Offline groups using Bluetooth — work without internet
        </Text>
      </View>

      {renderOfflineIndicator()}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Icon name="plus" size={24} color={COLORS.text} />
          <Text style={styles.actionButtonText}>Create Group</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={() => setShowJoinModal(true)}
        >
          <Icon name="account-plus" size={24} color={COLORS.primary} />
          <Text style={[styles.actionButtonText, { color: COLORS.primary }]}>
            Join Group
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={privateGroups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
      />

      <View style={styles.infoSection}>
        <Icon name="wifi-off" size={20} color={COLORS.warning} />
        <Text style={styles.infoText}>
          Groups work offline via Bluetooth. Share codes BEFORE going offline. Only group members can see each other's beacons.
        </Text>
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
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  offlineIndicator: {
    backgroundColor: COLORS.surfaceLight,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  offlineIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    marginRight: 10,
  },
  offlineIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.warning,
    marginBottom: 2,
  },
  offlineSubText: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textMuted,
    marginLeft: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  actionButtonText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  listContent: {
    padding: 20,
    paddingTop: 5,
    flexGrow: 1,
  },
  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  groupCardActive: {
    borderLeftColor: COLORS.success,
    backgroundColor: COLORS.surfaceLight,
  },
  scanActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 217, 100, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  scanActiveText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 14,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  groupCode: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  groupCodeLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  groupCodeValue: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.primary,
  },
  shareButton: {
    padding: 10,
  },
  groupActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  groupAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  checkInAction: {
    backgroundColor: COLORS.success,
  },
  sosAction: {
    backgroundColor: COLORS.emergency,
  },
  scanAction: {
    backgroundColor: COLORS.info,
  },
  scanActionActive: {
    backgroundColor: COLORS.warning,
  },
  groupActionText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: COLORS.surfaceLight,
    gap: 6,
  },
  leaveButtonText: {
    color: COLORS.emergency,
    fontSize: 13,
    fontWeight: '700',
  },
  // Member details view
  detailsContainer: {
    flex: 1,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  closeButton: {
    padding: 8,
    marginLeft: -8,
  },
  detailsTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginLeft: 12,
  },
  memberCount: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  memberCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  scanStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    gap: 8,
  },
  scanStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
  },
  membersList: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: 14,
    marginBottom: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  memberCardOffline: {
    borderLeftColor: COLORS.textMuted,
    opacity: 0.6,
  },
  memberHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  memberTime: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  navigateButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emergency,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  navigateButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  detailsActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  checkInButton: {
    backgroundColor: COLORS.success,
  },
  sosButton: {
    backgroundColor: COLORS.emergency,
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
    marginTop: 12,
    lineHeight: 22,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modal: {
    width: '90%',
    maxWidth: 400,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 20,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 5,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundLight,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalConfirmDisabled: {
    opacity: 0.5,
  },
  modalConfirmText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GroupScreen;
