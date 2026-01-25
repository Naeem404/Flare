# FLARE Mobile App

React Native mobile application for the FLARE Emergency Rescue Beacon system.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS, macOS only)

### Installation

1. **Install dependencies:**
```bash
cd src
npm install
```

2. **iOS Setup (macOS only):**
```bash
cd ios
pod install
cd ..
```

3. **Run on Android:**
```bash
npm run android
```

4. **Run on iOS:**
```bash
npm run ios
```

## Project Structure

```
src/
├── App.js                    # Main app with navigation
├── screens/
│   ├── HomeScreen.js         # Main entry with mode selection
│   ├── VictimScreen.js       # SOS beacon activation
│   ├── RescuerScreen.js      # Radar/scanner view
│   ├── HeatMapScreen.js      # 2D heat map navigator
│   ├── ARViewScreen.js       # AR camera view (stretch goal)
│   ├── SettingsScreen.js     # App settings
│   ├── GroupScreen.js        # Private groups management
│   └── ProfessionalModeScreen.js  # Certified rescuer mode
├── components/
│   ├── BeaconCard.js         # Victim beacon card
│   ├── HeatMapCanvas.js      # Heat map grid visualization
│   ├── RadarView.js          # Circular radar display
│   └── SignalStrength.js     # Signal strength indicator
├── services/
│   ├── BluetoothService.js   # BLE operations
│   ├── WiFiService.js        # WiFi Direct operations
│   ├── SupabaseService.js    # Cloud sync
│   ├── NavigationService.js  # Distance/direction calc
│   └── HeatMapService.js     # Obstacle detection
├── context/
│   ├── AppContext.js         # Global app state
│   └── BluetoothContext.js   # Bluetooth state
└── utils/
    ├── constants.js          # App constants
    └── rssiCalculator.js     # RSSI calculations
```

## Features

### Victim Mode
- One-tap SOS activation
- Continuous Bluetooth beacon broadcasting
- Battery status monitoring
- Emergency type selection
- Optional message

### Rescuer Mode
- Radar view of detected beacons
- Real-time distance estimation
- Signal strength indicators
- Navigation guidance (hot/cold)
- Priority sorting (low battery first)

### Heat Map Navigator
- 2D grid visualization
- Obstacle detection via signal analysis
- Path finding suggestions
- Real-time updates as you move

### AR View (Stretch Goal)
- Camera overlay with beacon markers
- 3D distance labels
- Directional indicators

### Private Groups
- Create family/friend groups
- Share join codes
- Group-only beacon visibility

### Professional Mode
- Certified rescuer authentication
- Access to all beacon types
- Dispatch system integration (placeholder)
- Team coordination features

## Configuration

### Backend API
Update the API URL in `src/services/SupabaseService.js`:
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### Environment Settings
Signal calibration can be adjusted in Settings screen or in `src/utils/constants.js`.

## Permissions Required

### Android
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `BLUETOOTH_ADVERTISE`
- `ACCESS_FINE_LOCATION`
- `ACCESS_WIFI_STATE`
- `CHANGE_WIFI_STATE`

### iOS
- Bluetooth
- Location (When In Use)
- Camera (for AR view)

## Troubleshooting

### Bluetooth not working
1. Ensure Bluetooth is enabled
2. Grant all required permissions
3. On Android 12+, location must be enabled

### Beacons not detected
1. Check if victim's beacon is active
2. Move closer (range ~100m)
3. Ensure same mode (public/private)

### Build errors
```bash
# Clean and rebuild
cd android && ./gradlew clean && cd ..
npm start -- --reset-cache
```
