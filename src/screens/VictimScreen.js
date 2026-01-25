/**
 * FLARE Victim Screen
 * SOS Beacon activation and management
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Animated,
  Vibration,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import { useApp } from '../context/AppContext';
import { useBluetooth } from '../context/BluetoothContext';
import BluetoothService from '../services/BluetoothService';
import SupabaseService from '../services/SupabaseService';
import { COLORS, EMERGENCY_TYPES, BEACON_MODES } from '../utils/constants';

const VictimScreen = ({ navigation, route }) => {
  const { deviceId, activeBeacon, activateBeacon, deactivateBeacon, currentMode } = useApp();
  const { startAdvertising, stopAdvertising, isAdvertising } = useBluetooth();
  
  const [isActive, setIsActive] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [message, setMessage] = useState('');
  const [timeActive, setTimeActive] = useState(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    loadBatteryLevel();
    
    if (activeBeacon) {
      setIsActive(true);
      startAnimations();
      startTimer();
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const loadBatteryLevel = async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(Math.round(level * 100));
    } catch (error) {
      console.error('Battery level error:', error);
    }
  };

  const startAnimations = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
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

    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  };

  const stopAnimations = () => {
    pulseAnim.stopAnimation();
    rotateAnim.stopAnimation();
    pulseAnim.setValue(1);
    rotateAnim.setValue(0);
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeActive((prev) => prev + 1);
    }, 1000);
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleActivateSOS = async () => {
    try {
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);

      const beaconData = {
        deviceId,
        deviceName: Device.deviceName || 'Unknown Device',
        mode: currentMode || BEACON_MODES.PUBLIC,
        batteryLevel,
        emergencyType: selectedEmergency,
        message: message.trim() || null,
        signalType: 'bluetooth',
      };

      await activateBeacon(beaconData);

      await startAdvertising(beaconData);

      try {
        await SupabaseService.createBeacon(beaconData);
      } catch (syncError) {
        console.log('Cloud sync failed, continuing offline:', syncError);
      }

      setIsActive(true);
      startAnimations();
      startTimer();

      Alert.alert(
        'SOS Activated',
        'Your beacon is now broadcasting. Rescuers can detect your signal.\n\nKeep your phone on and stay calm.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Activate SOS error:', error);
      Alert.alert('Error', 'Failed to activate SOS beacon. Please try again.');
    }
  };

  const handleDeactivateSOS = () => {
    Alert.alert(
      'Cancel SOS?',
      'Are you sure you want to cancel your SOS beacon?',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              stopAdvertising();
              await deactivateBeacon();
              
              stopAnimations();
              if (timerRef.current) {
                clearInterval(timerRef.current);
              }
              
              setIsActive(false);
              setTimeActive(0);
              
              Vibration.vibrate(100);
            } catch (error) {
              console.error('Deactivate SOS error:', error);
            }
          },
        },
      ]
    );
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderEmergencyTypes = () => (
    <View style={styles.emergencySection}>
      <Text style={styles.sectionTitle}>Emergency Type (Optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.emergencyTypes}>
          {EMERGENCY_TYPES.map((type) => (
            <TouchableOpacity
              key={type.id}
              style={[
                styles.emergencyType,
                selectedEmergency === type.id && styles.emergencyTypeSelected,
              ]}
              onPress={() => setSelectedEmergency(
                selectedEmergency === type.id ? null : type.id
              )}
              disabled={isActive}
            >
              <Icon
                name={type.icon}
                size={24}
                color={selectedEmergency === type.id ? COLORS.text : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.emergencyTypeText,
                  selectedEmergency === type.id && styles.emergencyTypeTextSelected,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isActive && (
            <View style={styles.activeHeader}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Icon name="broadcast" size={30} color={COLORS.primary} />
              </Animated.View>
              <View style={styles.activeInfo}>
                <Text style={styles.activeTitle}>SOS BEACON ACTIVE</Text>
                <Text style={styles.activeTime}>
                  Broadcasting for {formatTime(timeActive)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.mainContent}>
            <TouchableOpacity
              style={[styles.sosButton, isActive && styles.sosButtonActive]}
              onPress={isActive ? handleDeactivateSOS : handleActivateSOS}
              activeOpacity={0.8}
            >
              <Animated.View
                style={[
                  styles.sosButtonOuter,
                  isActive && { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <View style={styles.sosButtonInner}>
                  <Icon
                    name={isActive ? 'close' : 'alert-circle'}
                    size={80}
                    color={COLORS.text}
                  />
                  <Text style={styles.sosButtonText}>
                    {isActive ? 'CANCEL SOS' : 'ACTIVATE SOS'}
                  </Text>
                </View>
              </Animated.View>
            </TouchableOpacity>

            {isActive && (
              <View style={styles.signalIndicator}>
                <View style={styles.signalWave} />
                <View style={[styles.signalWave, styles.signalWave2]} />
                <View style={[styles.signalWave, styles.signalWave3]} />
              </View>
            )}
          </View>

          <View style={styles.statusSection}>
            <View style={styles.statusItem}>
              <Icon name="battery" size={24} color={batteryLevel > 20 ? COLORS.secondary : COLORS.danger} />
              <Text style={styles.statusLabel}>Battery</Text>
              <Text style={[styles.statusValue, batteryLevel <= 20 && { color: COLORS.danger }]}>
                {batteryLevel}%
              </Text>
            </View>
            <View style={styles.statusItem}>
              <Icon name="bluetooth" size={24} color={COLORS.info} />
              <Text style={styles.statusLabel}>Signal</Text>
              <Text style={styles.statusValue}>Bluetooth</Text>
            </View>
            <View style={styles.statusItem}>
              <Icon name="signal" size={24} color={COLORS.secondary} />
              <Text style={styles.statusLabel}>Range</Text>
              <Text style={styles.statusValue}>~100m</Text>
            </View>
          </View>

          {!isActive && (
            <>
              {renderEmergencyTypes()}

              <View style={styles.messageSection}>
                <Text style={styles.sectionTitle}>Message (Optional)</Text>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Add details about your situation..."
                  placeholderTextColor={COLORS.textMuted}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={200}
                />
                <Text style={styles.charCount}>{message.length}/200</Text>
              </View>
            </>
          )}

          <View style={styles.infoSection}>
            <View style={styles.infoItem}>
              <Icon name="information" size={20} color={COLORS.info} />
              <Text style={styles.infoText}>
                {isActive
                  ? 'Keep your phone on. Rescuers will follow your signal.'
                  : 'Your phone will broadcast a signal that rescuers can detect.'}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Icon name="wifi-off" size={20} color={COLORS.secondary} />
              <Text style={styles.infoText}>
                Works without internet or cell service.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  activeInfo: {
    marginLeft: 15,
  },
  activeTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  activeTime: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  mainContent: {
    alignItems: 'center',
    marginVertical: 20,
  },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 15,
  },
  sosButtonActive: {
    backgroundColor: COLORS.danger,
  },
  sosButtonOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosButtonInner: {
    alignItems: 'center',
  },
  sosButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  signalIndicator: {
    position: 'absolute',
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signalWave: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: COLORS.primary,
    opacity: 0.3,
  },
  signalWave2: {
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.2,
  },
  signalWave3: {
    width: 350,
    height: 350,
    borderRadius: 175,
    opacity: 0.1,
  },
  statusSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 12,
    marginVertical: 20,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },
  statusValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  emergencySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  emergencyTypes: {
    flexDirection: 'row',
    gap: 10,
  },
  emergencyType: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    minWidth: 80,
  },
  emergencyTypeSelected: {
    backgroundColor: COLORS.primary,
  },
  emergencyTypeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
  },
  emergencyTypeTextSelected: {
    color: COLORS.text,
  },
  messageSection: {
    marginBottom: 20,
  },
  messageInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 15,
    color: COLORS.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 5,
  },
  infoSection: {
    gap: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
  },
});

export default VictimScreen;
