/**
 * FLARE Home Screen
 * Main entry point with mode selection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import { COLORS, BEACON_MODES, TRIGGER_METHODS } from '../utils/constants';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const { deviceId, isBeaconActive, currentMode, setMode } = useApp();
  const { isBluetoothEnabled, permissionsGranted } = useBluetooth();
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (isBeaconActive) {
      startPulseAnimation();
    }
  }, [isBeaconActive]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
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

  const handleModeSelect = (mode, screen) => {
    if (!isBluetoothEnabled) {
      Alert.alert(
        'Bluetooth Required',
        'Please enable Bluetooth to use FLARE.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!permissionsGranted) {
      Alert.alert(
        'Permissions Required',
        'FLARE needs location and Bluetooth permissions to function.',
        [{ text: 'OK' }]
      );
      return;
    }

    setMode(mode);
    navigation.navigate(screen);
  };

  const renderStatusBar = () => (
    <View style={styles.statusBar}>
      <View style={styles.statusItem}>
        <Icon
          name={isBluetoothEnabled ? 'bluetooth' : 'bluetooth-off'}
          size={20}
          color={isBluetoothEnabled ? COLORS.success : COLORS.emergency}
        />
        <Text style={[styles.statusText, { color: isBluetoothEnabled ? COLORS.success : COLORS.emergency }]}>
          {isBluetoothEnabled ? 'BT On' : 'BT Off'}
        </Text>
      </View>
      {isBeaconActive && (
        <View style={styles.statusItem}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Icon name="broadcast" size={20} color={COLORS.emergency} />
          </Animated.View>
          <Text style={[styles.statusText, { color: COLORS.emergency }]}>
            SOS Active
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.statusItem}
        onPress={() => navigation.navigate('Settings')}
      >
        <Icon name="cog" size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      {renderStatusBar()}

      <View style={styles.header}>
        <Text style={styles.logo}>FLARE</Text>
        <Text style={styles.tagline}>Emergency Rescue Beacon</Text>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.sosButtonContainer}>
          <View style={styles.sosGlowRing1} />
          <View style={styles.sosGlowRing2} />
          <View style={styles.sosGlowRing3} />
          <TouchableOpacity
            style={[styles.sosButton, isBeaconActive && styles.sosButtonActive]}
            onPress={() => handleModeSelect(BEACON_MODES.PUBLIC, 'Victim')}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.sosButtonInner,
                isBeaconActive && { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Icon
                name={isBeaconActive ? 'broadcast' : 'alert-circle'}
                size={60}
                color={COLORS.textPrimary}
              />
              <Text style={styles.sosButtonText}>
                {isBeaconActive ? 'SOS ACTIVE' : 'SEND SOS'}
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

        <Text style={styles.triggerHint}>
          {TRIGGER_METHODS.PUBLIC.method}
        </Text>
      </View>

      <View style={styles.modeSection}>
        <Text style={styles.sectionTitle}>I am a...</Text>
        
        <View style={styles.modeButtons}>
          <TouchableOpacity
            style={styles.modeButton}
            onPress={() => handleModeSelect(BEACON_MODES.PUBLIC, 'Rescuer')}
          >
            <View style={[styles.modeIcon, { backgroundColor: COLORS.info }]}>
              <Icon name="account-search" size={32} color={COLORS.textPrimary} />
            </View>
            <Text style={styles.modeButtonText}>Rescuer</Text>
            <Text style={styles.modeDescription}>Find victims</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}
            onPress={() => navigation.navigate('Professional')}
          >
            <View style={[styles.modeIcon, { backgroundColor: COLORS.primary }]}>
              <Icon name="shield-account" size={32} color={COLORS.textPrimary} />
            </View>
            <Text style={styles.modeButtonText}>Professional</Text>
            <Text style={styles.modeDescription}>Certified rescue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}
            onPress={() => navigation.navigate('Group')}
          >
            <View style={[styles.modeIcon, { backgroundColor: COLORS.success }]}>
              <Icon name="account-group" size={32} color={COLORS.textPrimary} />
            </View>
            <Text style={styles.modeButtonText}>My Group</Text>
            <Text style={styles.modeDescription}>Family & friends</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Device ID: {deviceId ? deviceId.substring(0, 8) : 'Loading...'}
        </Text>
        <Text style={styles.footerNote}>
          No internet required • Works offline
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
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
    textShadowColor: 'rgba(255, 184, 0, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '400',
    color: COLORS.textSecondary,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  mainContent: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  sosButtonContainer: {
    width: width * 0.5,
    height: width * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosGlowRing1: {
    position: 'absolute',
    width: width * 0.55,
    height: width * 0.55,
    borderRadius: width * 0.275,
    backgroundColor: COLORS.emergencyGlow,
  },
  sosGlowRing2: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  sosGlowRing3: {
    position: 'absolute',
    width: width * 0.65,
    height: width * 0.65,
    borderRadius: width * 0.325,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
  },
  sosButton: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    backgroundColor: COLORS.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.emergency,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 15,
  },
  sosButtonActive: {
    backgroundColor: COLORS.emergencyDark,
  },
  sosButtonInner: {
    alignItems: 'center',
  },
  sosButtonText: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
    letterSpacing: 1,
  },
  triggerHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 15,
    textAlign: 'center',
  },
  modeSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 15,
    textAlign: 'center',
  },
  modeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  modeButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    width: (width - 60) / 3,
  },
  modeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  modeDescription: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 4,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  footerNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 5,
  },
});

export default HomeScreen;
