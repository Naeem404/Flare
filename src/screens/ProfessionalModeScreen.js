/**
 * FLARE Professional Mode Screen
 * Certified rescuer mode with enhanced features
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  FlatList,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import { COLORS, BEACON_MODES } from '../utils/constants';
import { formatDistance, getSignalQuality, formatBatteryStatus } from '../utils/rssiCalculator';

// Simple hash function for offline credential storage
const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

const CREDENTIALS_STORAGE_KEY = 'pro_mode_credentials';
const SESSION_STORAGE_KEY = 'pro_mode_session';

const ProfessionalModeScreen = ({ navigation }) => {
  const { setMode } = useApp();
  const {
    isScanning,
    detectedBeacons,
    selectedBeacon,
    startScanning,
    stopScanning,
    selectBeacon,
  } = useBluetooth();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [orgCode, setOrgCode] = useState('');
  const [personalPin, setPersonalPin] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Professional dashboard state
  const [scanMode, setScanMode] = useState('all'); // 'all' or 'professional'
  const [autoAcceptNearest, setAutoAcceptNearest] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [activeMission, setActiveMission] = useState(null);

  // Session tracking
  const [sessionStats, setSessionStats] = useState({
    startTime: null,
    beaconsDetected: [],
    missionsAccepted: [],
    sessionDuration: 0,
  });

  const sessionIntervalRef = useRef(null);

  useEffect(() => {
    loadStoredCredentials();
  }, []);

  useEffect(() => {
    if (isAuthenticated && isScanning) {
      const interval = setInterval(() => {
        setSessionStats((prev) => ({
          ...prev,
          sessionDuration: Date.now() - (prev.startTime || Date.now()),
        }));
      }, 1000);
      sessionIntervalRef.current = interval;
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isScanning]);

  useEffect(() => {
    return () => {
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current);
      }
      stopScanning();
    };
  }, []);

  // Load stored credentials
  const loadStoredCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(CREDENTIALS_STORAGE_KEY);
      if (stored) {
        const { orgCode: storedOrg, pinHash } = JSON.parse(stored);
        setOrgCode(storedOrg);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Error loading stored credentials:', error);
    }
  };

  // Hash and store credentials
  const storeCredentials = async () => {
    try {
      const pinHash = simpleHash(personalPin);
      await AsyncStorage.setItem(
        CREDENTIALS_STORAGE_KEY,
        JSON.stringify({ orgCode, pinHash })
      );
    } catch (error) {
      console.error('Error storing credentials:', error);
    }
  };

  // Verify credentials
  const verifyCredentials = async () => {
    if (!orgCode.trim()) {
      Alert.alert('Error', 'Please enter your organization code');
      return;
    }

    if (!personalPin.trim() || personalPin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }

    setIsLoading(true);

    try {
      // Demo access code
      if (orgCode === 'FLARE' && personalPin === '1234') {
        setIsAuthenticated(true);
        if (rememberMe) {
          await storeCredentials();
        }
        setSessionStats({
          startTime: Date.now(),
          beaconsDetected: [],
          missionsAccepted: [],
          sessionDuration: 0,
        });
        return;
      }

      // Check stored credentials
      const stored = await AsyncStorage.getItem(CREDENTIALS_STORAGE_KEY);
      if (stored) {
        const { orgCode: storedOrg, pinHash: storedPinHash } = JSON.parse(stored);
        const currentPinHash = simpleHash(personalPin);

        if (orgCode === storedOrg && currentPinHash === storedPinHash) {
          setIsAuthenticated(true);
          setSessionStats({
            startTime: Date.now(),
            beaconsDetected: [],
            missionsAccepted: [],
            sessionDuration: 0,
          });
          return;
        }
      }

      Alert.alert(
        'Authentication Failed',
        'Invalid organization code or PIN. Try "FLARE" / "1234" for demo access.'
      );
    } catch (error) {
      Alert.alert('Error', 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle starting scan
  const handleStartScan = async () => {
    try {
      if (!isScanning) {
        setSessionStats((prev) => ({
          ...prev,
          startTime: prev.startTime || Date.now(),
        }));
        await startScanning(BEACON_MODES.PROFESSIONAL);
      }
    } catch (error) {
      Alert.alert('Scan Error', 'Failed to start scanning.');
    }
  };

  const handleStopScan = () => {
    stopScanning();
  };

  // Track beacons in session
  useEffect(() => {
    if (isScanning && detectedBeacons.length > 0) {
      setSessionStats((prev) => {
        const newBeacons = detectedBeacons.filter(
          (beacon) =>
            !prev.beaconsDetected.some((b) => b.deviceId === beacon.deviceId)
        );

        if (newBeacons.length > 0) {
          return {
            ...prev,
            beaconsDetected: [
              ...prev.beaconsDetected,
              ...newBeacons.map((b) => ({
                deviceId: b.deviceId,
                firstSeen: b.firstSeen,
                lastSeen: b.lastSeen,
                minDistance: b.distance,
              })),
            ],
          };
        }

        return prev;
      });
    }
  }, [detectedBeacons, isScanning]);

  // Accept beacon as mission
  const handleAcceptMission = (beacon) => {
    setActiveMission(beacon);
    selectBeacon(beacon);

    setSessionStats((prev) => ({
      ...prev,
      missionsAccepted: [
        ...prev.missionsAccepted.filter((m) => m.beaconId !== beacon.deviceId),
        {
          beaconId: beacon.deviceId,
          acceptedAt: Date.now(),
          status: 'active',
        },
      ],
    }));
  };

  // Navigate to map
  const handleNavigateToBeacon = (beacon) => {
    selectBeacon(beacon);
    navigation.navigate('HeatMap', { beacon });
  };

  // Logout
  const handleLogout = () => {
    Alert.alert('End Professional Session?', 'Log out and return to home screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: () => {
          stopScanning();
          setIsAuthenticated(false);
          setActiveMission(null);
          setSessionStats({
            startTime: null,
            beaconsDetected: [],
            missionsAccepted: [],
            sessionDuration: 0,
          });
        },
      },
    ]);
  };

  // Get beacons sorted by priority
  const getPrioritySortedBeacons = () => {
    return [...detectedBeacons].sort((a, b) => {
      // Sort by battery level (lowest first)
      if (a.batteryLevel !== b.batteryLevel) {
        return a.batteryLevel - b.batteryLevel;
      }
      // Then by time since first detected
      return (a.firstSeen || 0) - (b.firstSeen || 0);
    });
  };

  // Get priority badge color
  const getPriorityColor = (battery) => {
    if (battery < 10) return COLORS.danger;
    if (battery < 20) return COLORS.warning;
    if (battery < 50) return COLORS.warning;
    return COLORS.success;
  };

  // Get priority label
  const getPriorityLabel = (battery) => {
    if (battery < 10) return 'CRITICAL';
    if (battery < 20) return 'URGENT';
    if (battery < 50) return 'MODERATE';
    return 'STABLE';
  };

  const formatSessionTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const renderAuthScreen = () => (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <View style={styles.authHeader}>
        <View style={styles.authIcon}>
          <Icon name="shield-account" size={60} color={COLORS.primary} />
        </View>
        <Text style={styles.authTitle}>Professional Rescuer Mode</Text>
        <Text style={styles.authSubtitle}>
          For certified emergency responders only
        </Text>
      </View>

      <View style={styles.authForm}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Organization Code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., FLARE, FD01, etc."
            placeholderTextColor={COLORS.textMuted}
            value={orgCode}
            onChangeText={setOrgCode}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Personal PIN (4-6 digits)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your personal PIN"
            placeholderTextColor={COLORS.textMuted}
            value={personalPin}
            onChangeText={setPersonalPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
        </View>

        <View style={styles.rememberMeRow}>
          <View style={styles.rememberMeInfo}>
            <Text style={styles.rememberMeLabel}>Remember credentials</Text>
            <Text style={styles.rememberMeDesc}>
              Store hashed PIN for offline access
            </Text>
          </View>
          <Switch
            value={rememberMe}
            onValueChange={setRememberMe}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.text}
          />
        </View>

        <TouchableOpacity
          style={[styles.authButton, isLoading && styles.authButtonDisabled]}
          onPress={verifyCredentials}
          disabled={isLoading}
        >
          <Icon name="shield-check" size={24} color={COLORS.textPrimary} />
          <Text style={styles.authButtonText}>
            {isLoading ? 'Verifying...' : 'Authenticate'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.authInfo}>
        <Icon name="information" size={20} color={COLORS.info} />
        <Text style={styles.authInfoText}>
          Professional mode provides offline-capable authentication and access to
          professional beacon frequencies and multi-victim triage features.
        </Text>
      </View>

      <View style={styles.demoNote}>
        <Text style={styles.demoNoteText}>
          Demo: Use "FLARE" / "1234" for demo access
        </Text>
      </View>
    </ScrollView>
  );

  const renderProfessionalDashboard = () => (
    <SafeAreaView style={styles.dashboardContainer}>
      {/* Header with session time and stats */}
      <View style={styles.dashboardHeader}>
        <View style={styles.verifiedBadge}>
          <Icon name="shield-check" size={20} color={COLORS.primary} />
          <Text style={styles.verifiedText}>Professional Mode</Text>
        </View>
        <View style={styles.sessionTimeContainer}>
          <Icon name="clock-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.sessionTimeText}>
            {formatSessionTime(sessionStats.sessionDuration)}
          </Text>
        </View>
      </View>

      {/* Triage Scanner Header */}
      <View style={styles.scannerHeader}>
        <View style={styles.scannerTitle}>
          <Icon name="radar" size={24} color={COLORS.primary} />
          <View style={styles.scannerTitleText}>
            <Text style={styles.scannerTitleMain}>Triage Scanner</Text>
            <Text style={styles.scannerTitleSub}>
              {detectedBeacons.length} beacon{detectedBeacons.length !== 1 ? 's' : ''} detected
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.scanToggleButton, isScanning && styles.scanToggleActive]}
          onPress={isScanning ? handleStopScan : handleStartScan}
        >
          <Icon
            name={isScanning ? 'pause' : 'play'}
            size={20}
            color={COLORS.textPrimary}
          />
          <Text style={styles.scanToggleText}>
            {isScanning ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentPadding}>
        {/* Active Mission Section */}
        {activeMission && (
          <View style={styles.activeMissionSection}>
            <View style={styles.activeMissionHeader}>
              <Icon name="target" size={20} color={COLORS.primary} />
              <Text style={styles.activeMissionTitle}>Active Mission</Text>
            </View>
            <View style={styles.activeMissionCard}>
              <View style={styles.missionMainInfo}>
                <View style={styles.missionDistance}>
                  <Text style={styles.missionDistanceValue}>
                    {formatDistance(activeMission.distance)}
                  </Text>
                  <Text style={styles.missionDistanceLabel}>Distance</Text>
                </View>
                <View style={styles.missionDeviceInfo}>
                  <Text style={styles.missionDeviceName}>
                    {activeMission.deviceName}
                  </Text>
                  <View style={styles.missionSignalRow}>
                    <Icon name="signal" size={14} color={COLORS.primary} />
                    <Text style={styles.missionSignalText}>
                      {activeMission.rssi} dBm
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.navigateButton}
                onPress={() => handleNavigateToBeacon(activeMission)}
              >
                <Icon name="map-marker" size={18} color={COLORS.textPrimary} />
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Dispatch Panel */}
        <View style={styles.dispatchSection}>
          <View style={styles.dispatchHeader}>
            <Icon name="inbox-multiple" size={20} color={COLORS.primary} />
            <Text style={styles.dispatchTitle}>Incoming Requests</Text>
            <View style={styles.dispatchBadge}>
              <Text style={styles.dispatchBadgeText}>
                {detectedBeacons.length}
              </Text>
            </View>
          </View>

          {detectedBeacons.length === 0 ? (
            <View style={styles.emptyDispatch}>
              <Icon name="inbox" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyDispatchText}>
                {isScanning ? 'Scanning for beacons...' : 'Start scanning to find beacons'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={getPrioritySortedBeacons()}
              keyExtractor={(item) => item.deviceId}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.dispatchRequestCard}>
                  <View style={styles.dispatchRequestHeader}>
                    <View
                      style={[
                        styles.priorityDot,
                        { backgroundColor: getPriorityColor(item.batteryLevel) },
                      ]}
                    />
                    <View style={styles.dispatchRequestInfo}>
                      <Text style={styles.dispatchRequestName}>
                        {item.deviceName}
                      </Text>
                      <View style={styles.dispatchRequestMeta}>
                        <View style={styles.metaItem}>
                          <Icon
                            name="map-marker-distance"
                            size={12}
                            color={COLORS.textSecondary}
                          />
                          <Text style={styles.metaText}>
                            {formatDistance(item.distance)}
                          </Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Icon
                            name="battery"
                            size={12}
                            color={getPriorityColor(item.batteryLevel)}
                          />
                          <Text style={styles.metaText}>
                            {item.batteryLevel}%
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(item.batteryLevel) },
                      ]}
                    >
                      <Text style={styles.priorityBadgeText}>
                        {getPriorityLabel(item.batteryLevel)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptMission(item)}
                  >
                    <Icon name="check-circle" size={18} color={COLORS.textPrimary} />
                    <Text style={styles.acceptButtonText}>Accept / Assign</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>

        {/* Professional Settings */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Professional Beacons Only</Text>
              <Text style={styles.settingDescription}>
                Hide public mode beacons
              </Text>
            </View>
            <Switch
              value={scanMode === 'professional'}
              onValueChange={(val) =>
                setScanMode(val ? 'professional' : 'all')
              }
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-Accept Nearest</Text>
              <Text style={styles.settingDescription}>
                Auto-assign closest beacon
              </Text>
            </View>
            <Switch
              value={autoAcceptNearest}
              onValueChange={setAutoAcceptNearest}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.text}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Sound Alerts</Text>
              <Text style={styles.settingDescription}>
                Alert on new beacon detection
              </Text>
            </View>
            <Switch
              value={soundAlerts}
              onValueChange={setSoundAlerts}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.text}
            />
          </View>
        </View>

        {/* Session Statistics */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Session Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {sessionStats.beaconsDetected.length}
              </Text>
              <Text style={styles.statLabel}>Beacons Found</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {sessionStats.missionsAccepted.length}
              </Text>
              <Text style={styles.statLabel}>Missions Accepted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {formatSessionTime(sessionStats.sessionDuration)}
              </Text>
              <Text style={styles.statLabel}>Session Time</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {detectedBeacons.filter((b) => b.batteryLevel < 20).length}
              </Text>
              <Text style={styles.statLabel}>Low Battery</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Icon name="logout" size={20} color={COLORS.danger} />
          <Text style={styles.logoutButtonText}>End Professional Session</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {isAuthenticated ? renderProfessionalDashboard() : renderAuthScreen()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // ============ AUTH SCREEN STYLES ============
  authContainer: {
    padding: 20,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  authIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  authSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  authForm: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 22,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  rememberMeInfo: {
    flex: 1,
  },
  rememberMeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rememberMeDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authButtonText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  authInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    gap: 12,
  },
  authInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  demoNote: {
    marginTop: 20,
    alignItems: 'center',
  },
  demoNoteText: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  // ============ DASHBOARD STYLES ============
  dashboardContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  verifiedText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sessionTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 12,
  },
  sessionTimeText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  // ============ SCANNER HEADER ============
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  scannerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scannerTitleText: {
    flex: 1,
  },
  scannerTitleMain: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  scannerTitleSub: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  scanToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 6,
  },
  scanToggleActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  scanToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  // ============ CONTENT SCROLL ============
  contentScroll: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
    paddingBottom: 20,
  },
  // ============ ACTIVE MISSION SECTION ============
  activeMissionSection: {
    marginBottom: 20,
  },
  activeMissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  activeMissionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeMissionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  missionMainInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  missionDistance: {
    alignItems: 'center',
  },
  missionDistanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  missionDistanceLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  missionDeviceInfo: {
    flex: 1,
  },
  missionDeviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  missionSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  missionSignalText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
  },
  navigateButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  // ============ DISPATCH PANEL ============
  dispatchSection: {
    marginBottom: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
  },
  dispatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dispatchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  dispatchBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  dispatchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyDispatch: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyDispatchText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 10,
  },
  dispatchRequestCard: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  dispatchRequestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dispatchRequestInfo: {
    flex: 1,
  },
  dispatchRequestName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  dispatchRequestMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  // ============ SETTINGS SECTION ============
  settingsSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // ============ STATS SECTION ============
  statsSection: {
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  // ============ LOGOUT BUTTON ============
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.danger,
    gap: 10,
    marginTop: 10,
  },
  logoutButtonText: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ProfessionalModeScreen;
