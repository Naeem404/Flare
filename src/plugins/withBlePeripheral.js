/**
 * Custom Expo Config Plugin for react-native-ble-peripheral
 * Adds required Android permissions and configurations for BLE advertising
 */

const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

function addPermissionsToManifest(androidManifest) {
  const { manifest } = androidManifest;

  // Ensure uses-permission array exists
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }

  // Ensure uses-feature array exists
  if (!manifest['uses-feature']) {
    manifest['uses-feature'] = [];
  }

  // BLE Peripheral permissions for Android
  const permissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_ADVERTISE',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
  ];

  permissions.forEach((permission) => {
    const exists = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === permission
    );
    if (!exists) {
      manifest['uses-permission'].push({
        $: { 'android:name': permission },
      });
    }
  });

  // Add BLE feature requirement
  const bleFeature = manifest['uses-feature'].find(
    (f) => f.$?.['android:name'] === 'android.hardware.bluetooth_le'
  );
  if (!bleFeature) {
    manifest['uses-feature'].push({
      $: {
        'android:name': 'android.hardware.bluetooth_le',
        'android:required': 'true',
      },
    });
  }

  return androidManifest;
}

function withBlePeripheralAndroid(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addPermissionsToManifest(config.modResults);
    return config;
  });
}

function withBlePeripheralIOS(config) {
  return withInfoPlist(config, (config) => {
    // Add iOS Bluetooth permissions
    config.modResults['NSBluetoothAlwaysUsageDescription'] =
      config.modResults['NSBluetoothAlwaysUsageDescription'] ||
      'FLARE needs Bluetooth to broadcast and detect emergency SOS beacons';
    
    config.modResults['NSBluetoothPeripheralUsageDescription'] =
      config.modResults['NSBluetoothPeripheralUsageDescription'] ||
      'FLARE needs Bluetooth to broadcast emergency SOS signals';

    // Add background modes for BLE
    if (!config.modResults['UIBackgroundModes']) {
      config.modResults['UIBackgroundModes'] = [];
    }
    
    const backgroundModes = config.modResults['UIBackgroundModes'];
    if (!backgroundModes.includes('bluetooth-central')) {
      backgroundModes.push('bluetooth-central');
    }
    if (!backgroundModes.includes('bluetooth-peripheral')) {
      backgroundModes.push('bluetooth-peripheral');
    }

    return config;
  });
}

module.exports = function withBlePeripheral(config) {
  config = withBlePeripheralAndroid(config);
  config = withBlePeripheralIOS(config);
  return config;
};
