/**
 * FLARE Group Screen
 * Private group management for family/friends
 */

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import SupabaseService from '../services/SupabaseService';
import { COLORS, BEACON_MODES } from '../utils/constants';

const GroupScreen = ({ navigation }) => {
  const { privateGroups, joinGroup, leaveGroup, setMode, deviceId } = useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setIsLoading(true);
    try {
      const group = await SupabaseService.createPrivateGroup({
        name: groupName.trim(),
        createdBy: deviceId,
      });

      await joinGroup(group);
      setGroupName('');
      setShowCreateModal(false);

      Alert.alert(
        'Group Created!',
        `Share this code with your group:\n\n${group.code}\n\nThey can use this code to join your group.`,
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
      const group = await SupabaseService.joinPrivateGroup(
        joinCode.trim().toUpperCase(),
        deviceId
      );

      await joinGroup(group);
      setJoinCode('');
      setShowJoinModal(false);

      Alert.alert('Success', `You've joined "${group.name}"!`);
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

  const handleActivateGroupSOS = (group) => {
    setMode(BEACON_MODES.PRIVATE);
    navigation.navigate('Victim', { groupId: group.id });
  };

  const handleScanGroupBeacons = (group) => {
    setMode(BEACON_MODES.PRIVATE);
    navigation.navigate('Rescuer', { groupId: group.id });
  };

  const renderGroupCard = ({ item: group }) => (
    <View style={styles.groupCard}>
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
        </View>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => handleShareCode(group)}
        >
          <Icon name="share-variant" size={20} color={COLORS.info} />
        </TouchableOpacity>
      </View>

      <View style={styles.groupActions}>
        <TouchableOpacity
          style={[styles.groupAction, styles.sosAction]}
          onPress={() => handleActivateGroupSOS(group)}
        >
          <Icon name="alert-circle" size={20} color={COLORS.text} />
          <Text style={styles.groupActionText}>Send SOS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.groupAction, styles.scanAction]}
          onPress={() => handleScanGroupBeacons(group)}
        >
          <Icon name="radar" size={20} color={COLORS.text} />
          <Text style={styles.groupActionText}>Find Members</Text>
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
          Only group members can see each other's SOS beacons
        </Text>
      </View>

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
        <Icon name="shield-check" size={20} color={COLORS.info} />
        <Text style={styles.infoText}>
          Private groups are end-to-end encrypted. Only members can detect each other's beacons.
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
  sosAction: {
    backgroundColor: COLORS.primary,
  },
  scanAction: {
    backgroundColor: COLORS.info,
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
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
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
