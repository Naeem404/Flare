/**
 * FLARE Settings Screen
 * App configuration and preferences
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, RSSI_CONFIG } from '../utils/constants';

const SettingsScreen = ({ navigation }) => {
  const { settings, updateSettings, deviceId } = useApp();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSettingChange = async (key, value) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    await updateSettings({ [key]: value });
  };

  const getEnvironmentLabel = (factor) => {
    if (factor <= 2.0) return 'Free Space';
    if (factor <= 2.5) return 'Indoor (Light)';
    if (factor <= 3.0) return 'Indoor (Walls)';
    if (factor <= 4.0) return 'Heavy Obstacles';
    return 'Rubble/Debris';
  };

  const handleResetSettings = () => {
    Alert.alert(
      'Reset Settings?',
      'This will restore all settings to their default values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const defaultSettings = {
              environmentFactor: 2.5,
              soundEnabled: true,
              vibrationEnabled: true,
              autoSync: true,
              highAccuracyMode: false,
            };
            setLocalSettings(defaultSettings);
            await updateSettings(defaultSettings);
          },
        },
      ]
    );
  };

  const renderSection = (title, children) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderToggle = (label, description, key, icon) => (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Icon name={icon} size={24} color={COLORS.primary} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
      <Switch
        value={localSettings[key]}
        onValueChange={(value) => handleSettingChange(key, value)}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor={COLORS.text}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderSection('Signal Calibration', (
          <>
            <View style={styles.settingRow}>
              <View style={styles.settingIcon}>
                <Icon name="tune" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Environment Type</Text>
                <Text style={styles.settingDescription}>
                  Adjust for your rescue environment
                </Text>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <View style={styles.buttonGroup}>
                {[2.0, 2.5, 3.0, 4.0, 5.0].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.envButton,
                      localSettings.environmentFactor === value && styles.envButtonActive
                    ]}
                    onPress={() => handleSettingChange('environmentFactor', value)}
                  >
                    <Text style={[
                      styles.envButtonText,
                      localSettings.environmentFactor === value && styles.envButtonTextActive
                    ]}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sliderValue}>
                {getEnvironmentLabel(localSettings.environmentFactor)}
              </Text>
            </View>
            <View style={styles.infoBox}>
              <Icon name="information" size={16} color={COLORS.info} />
              <Text style={styles.infoText}>
                Higher values account for signal loss through walls and debris.
                Use "Rubble" for earthquake rescue scenarios.
              </Text>
            </View>
          </>
        ))}

        {renderSection('Notifications', (
          <>
            {renderToggle(
              'Sound Alerts',
              'Play sounds when beacons are detected',
              'soundEnabled',
              'volume-high'
            )}
            {renderToggle(
              'Vibration',
              'Vibrate on proximity alerts',
              'vibrationEnabled',
              'vibrate'
            )}
          </>
        ))}

        {renderSection('Data & Sync', (
          <>
            {renderToggle(
              'Auto Sync',
              'Sync data when internet is available',
              'autoSync',
              'cloud-sync'
            )}
            {renderToggle(
              'High Accuracy Mode',
              'More frequent scans (uses more battery)',
              'highAccuracyMode',
              'crosshairs-gps'
            )}
          </>
        ))}

        {renderSection('Device Info', (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Device ID</Text>
              <Text style={styles.infoValue}>
                {deviceId ? deviceId.substring(0, 16) : 'Loading...'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>App Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Signal Range</Text>
              <Text style={styles.infoValue}>~100m (Bluetooth)</Text>
            </View>
          </>
        ))}

        {renderSection('About FLARE', (
          <View style={styles.aboutSection}>
            <Text style={styles.aboutText}>
              FLARE turns any smartphone into a rescue beacon. When disaster strikes,
              victims press one button and their phone becomes a homing signal.
              Rescuers follow the signal with real-time distance updates.
            </Text>
            <View style={styles.features}>
              <View style={styles.featureItem}>
                <Icon name="wifi-off" size={20} color={COLORS.secondary} />
                <Text style={styles.featureText}>No internet required</Text>
              </View>
              <View style={styles.featureItem}>
                <Icon name="satellite-variant" size={20} color={COLORS.secondary} />
                <Text style={styles.featureText}>No GPS needed</Text>
              </View>
              <View style={styles.featureItem}>
                <Icon name="bluetooth" size={20} color={COLORS.secondary} />
                <Text style={styles.featureText}>Bluetooth P2P</Text>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.resetButton} onPress={handleResetSettings}>
          <Icon name="restore" size={20} color={COLORS.danger} />
          <Text style={styles.resetButtonText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 15,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 5,
  },
  sectionContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingIcon: {
    width: 40,
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginLeft: 10,
  },
  settingLabel: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sliderContainer: {
    padding: 15,
    paddingTop: 5,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  envButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  envButtonActive: {
    backgroundColor: COLORS.primary,
  },
  envButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  envButtonTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.backgroundLight,
    padding: 12,
    margin: 15,
    marginTop: 0,
    borderRadius: 8,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  aboutSection: {
    padding: 15,
  },
  aboutText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  features: {
    marginTop: 15,
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: COLORS.text,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    gap: 10,
    marginTop: 10,
  },
  resetButtonText: {
    fontSize: 16,
    color: COLORS.danger,
    fontWeight: '500',
  },
});

export default SettingsScreen;
