/**
 * FLARE Professional Mode Screen
 * Certified rescuer mode with enhanced features
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
  Switch,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, BEACON_MODES } from '../utils/constants';

const ProfessionalModeScreen = ({ navigation }) => {
  const { setMode, isVerifiedRescuer, deviceId } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [organization, setOrganization] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAllBeacons, setShowAllBeacons] = useState(true);

  useEffect(() => {
    if (isVerifiedRescuer) {
      setIsAuthenticated(true);
    }
  }, [isVerifiedRescuer]);

  const handleAuthenticate = async () => {
    if (!accessCode.trim()) {
      Alert.alert('Error', 'Please enter your access code');
      return;
    }

    if (!organization.trim()) {
      Alert.alert('Error', 'Please enter your organization');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (accessCode === 'RESCUE2024' || accessCode === 'DEMO') {
        setIsAuthenticated(true);
        Alert.alert(
          'Authenticated',
          `Welcome, ${organization} responder.\n\nYou now have access to professional rescue features.`
        );
      } else {
        Alert.alert(
          'Authentication Failed',
          'Invalid access code. Contact your department administrator.'
        );
      }
      setIsLoading(false);
    }, 1500);
  };

  const handleStartProfessionalRescue = () => {
    setMode(BEACON_MODES.PROFESSIONAL);
    navigation.navigate('Rescuer', { mode: 'professional' });
  };

  const handleViewDispatch = () => {
    Alert.alert(
      'Dispatch System',
      'This feature connects to emergency dispatch systems.\n\nIn production, this would show:\n• Active emergency calls\n• Assigned incidents\n• Team coordination\n• Real-time updates',
      [{ text: 'OK' }]
    );
  };

  const handleTeamCoordination = () => {
    Alert.alert(
      'Team Coordination',
      'Coordinate with other professional rescuers.\n\nFeatures include:\n• Team member locations\n• Shared beacon assignments\n• Communication channels\n• Status updates',
      [{ text: 'OK' }]
    );
  };

  const renderAuthScreen = () => (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <View style={styles.authHeader}>
        <View style={styles.authIcon}>
          <Icon name="shield-account" size={60} color={COLORS.warning} />
        </View>
        <Text style={styles.authTitle}>Professional Rescuer Mode</Text>
        <Text style={styles.authSubtitle}>
          For certified emergency responders only
        </Text>
      </View>

      <View style={styles.authForm}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Organization</Text>
          <TextInput
            style={styles.input}
            placeholder="Fire Dept, Police, EMT, etc."
            placeholderTextColor={COLORS.textMuted}
            value={organization}
            onChangeText={setOrganization}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Badge/ID Number (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Your badge or ID number"
            placeholderTextColor={COLORS.textMuted}
            value={badgeNumber}
            onChangeText={setBadgeNumber}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Access Code</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter department access code"
            placeholderTextColor={COLORS.textMuted}
            value={accessCode}
            onChangeText={setAccessCode}
            secureTextEntry
            autoCapitalize="characters"
          />
        </View>

        <TouchableOpacity
          style={[styles.authButton, isLoading && styles.authButtonDisabled]}
          onPress={handleAuthenticate}
          disabled={isLoading}
        >
          <Icon name="shield-check" size={24} color={COLORS.text} />
          <Text style={styles.authButtonText}>
            {isLoading ? 'Verifying...' : 'Authenticate'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.authInfo}>
        <Icon name="information" size={20} color={COLORS.info} />
        <Text style={styles.authInfoText}>
          Professional mode provides access to all beacon types (public and professional)
          and connects to emergency dispatch systems. Contact your department administrator
          for access credentials.
        </Text>
      </View>

      <View style={styles.demoNote}>
        <Text style={styles.demoNoteText}>
          Demo: Use code "DEMO" to test professional features
        </Text>
      </View>
    </ScrollView>
  );

  const renderProfessionalDashboard = () => (
    <ScrollView contentContainerStyle={styles.dashboardContainer}>
      <View style={styles.dashboardHeader}>
        <View style={styles.verifiedBadge}>
          <Icon name="shield-check" size={24} color={COLORS.info} />
          <Text style={styles.verifiedText}>Verified Rescuer</Text>
        </View>
        <Text style={styles.organizationText}>{organization || 'Emergency Services'}</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.primaryAction}
          onPress={handleStartProfessionalRescue}
        >
          <Icon name="radar" size={40} color={COLORS.text} />
          <Text style={styles.primaryActionText}>Start Rescue Scan</Text>
          <Text style={styles.primaryActionSubtext}>
            Detect all SOS beacons in range
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Scan Settings</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Show All Beacon Types</Text>
            <Text style={styles.settingDescription}>
              Include public and professional beacons
            </Text>
          </View>
          <Switch
            value={showAllBeacons}
            onValueChange={setShowAllBeacons}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.text}
          />
        </View>
      </View>

      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Professional Features</Text>

        <TouchableOpacity style={styles.featureCard} onPress={handleViewDispatch}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.danger }]}>
            <Icon name="phone-alert" size={24} color={COLORS.text} />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>Emergency Dispatch</Text>
            <Text style={styles.featureDescription}>
              View active calls and assigned incidents
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureCard} onPress={handleTeamCoordination}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.info }]}>
            <Icon name="account-group" size={24} color={COLORS.text} />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>Team Coordination</Text>
            <Text style={styles.featureDescription}>
              Coordinate with other responders
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.info }]}>
            <Icon name="map-marker-multiple" size={24} color={COLORS.text} />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>Multi-Victim Triage</Text>
            <Text style={styles.featureDescription}>
              Prioritize victims by battery and distance
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.featureCard}>
          <View style={[styles.featureIcon, { backgroundColor: COLORS.warning }]}>
            <Icon name="file-document" size={24} color={COLORS.text} />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>Incident Reports</Text>
            <Text style={styles.featureDescription}>
              Generate and submit rescue reports
            </Text>
          </View>
          <Icon name="chevron-right" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>Session Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Beacons Found</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Rescues Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>--</Text>
            <Text style={styles.statLabel}>Avg Response Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Team Members</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => {
          Alert.alert(
            'End Session?',
            'This will log you out of professional mode.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'End Session',
                onPress: () => setIsAuthenticated(false),
              },
            ]
          );
        }}
      >
        <Icon name="logout" size={20} color={COLORS.danger} />
        <Text style={styles.logoutButtonText}>End Professional Session</Text>
      </TouchableOpacity>
    </ScrollView>
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
  dashboardContainer: {
    padding: 20,
  },
  dashboardHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    gap: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  verifiedText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  organizationText: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 0.3,
  },
  quickActions: {
    marginBottom: 28,
  },
  primaryAction: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  primaryActionText: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  primaryActionSubtext: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.9,
    marginTop: 6,
  },
  settingsSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 25,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
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
  featuresSection: {
    marginBottom: 25,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureInfo: {
    flex: 1,
    marginLeft: 15,
  },
  featureTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '600',
  },
  featureDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statsSection: {
    marginBottom: 25,
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
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 5,
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    gap: 10,
  },
  logoutButtonText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ProfessionalModeScreen;
