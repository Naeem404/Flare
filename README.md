# 🔥 FLARE - Emergency Rescue Beacon

**Turn any smartphone into a rescue beacon. When disaster strikes and someone is trapped, they press one button - their phone becomes a homing signal.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📱 The Core Concept

FLARE turns any smartphone into a rescue beacon. When disaster strikes and someone is trapped, they press one button - their phone becomes a homing signal. Rescuers follow the signal like a treasure hunt, with real-time distance updates and a heat map showing safe paths around obstacles.

**No GPS, no internet, no special equipment needed. Just Bluetooth waves and smart navigation.**

## 🎯 The Problem We're Solving

During disasters (earthquakes, building collapses, floods):
- Cell towers are down - no calls or texts
- GPS doesn't work indoors or under rubble
- Rescuers can't locate victims who are:
  - Unconscious and can't call for help
  - Buried under debris
  - Lost and don't know their own location
  - Children who can't describe where they are

**FLARE solves the problem: FINDING people who can't communicate.**

## 💡 Our Solution

### Two-sided app system:

**Victim Side (SOS Beacon):**
- One-tap SOS button
- Phone becomes a continuous Bluetooth/WiFi beacon
- Works even if victim is unconscious (just needs to be turned on once)
- Broadcasts device ID + battery status

**Rescuer Side (Navigator):**
- Detects all SOS beacons in range
- Shows distance to each victim (using signal strength)
- Provides directional navigation ("hot/cold" guidance)
- 2D Heat Map showing safe paths vs obstacles
- AR View (optional) with 3D markers overlaid on camera

## 🔧 Key Technologies

| Technology | Range | Accuracy | Purpose |
|------------|-------|----------|---------|
| Bluetooth LE | ~100m | ±3-5m | Primary victim detection |
| WiFi Direct | ~200m | ±2-4m | Extended range detection |
| UWB (if available) | ~50m | ±10-30cm | High-precision positioning |

### RSSI-Based Distance Estimation
- RSSI = Received Signal Strength Indicator
- Stronger signal = closer to victim
- Formula converts signal strength → approximate distance
- Updates in real-time as rescuer moves

### Movement-Based Direction Finding
```
Rescuer walks 5 meters →
Signal got stronger? → "Keep going this direction ✓"
Signal got weaker? → "Turn around ↺"
```

### Obstacle Detection
We detect obstacles WITHOUT imaging by analyzing signal patterns:
- 🟢 **GREEN** = Clear path (strong, stable signal)
- 🟡 **YELLOW** = Unstable area (fluctuating signal)
- 🔴 **RED** = Obstacle detected (sudden signal drop)

## 🎨 User Interface

### View 1: Radar Screen
```
┌─────────────────────────┐
│   🎯 FLARE SCANNER      │
├─────────────────────────┤
│        )))))))          │
│       )))))))           │
│      ⊙  👤  Victim A    │
│         ↑ 12m away      │
│  Signal: ▓▓▓▓▓▓░░░░    │
│  Battery: 42%           │
└─────────────────────────┘
```

### View 2: Heat Map Navigator
```
┌─────────────────────────┐
│   🗺️ HEAT MAP          │
├─────────────────────────┤
│  🟢🟢🟢🔴🔴            │
│  🟢🟢🔴🔴🔴            │
│  🟢YOU🟢🟡🔴           │
│  🟢🟢🟢🟢📍 Victim    │
│  Safe path detected →  │
└─────────────────────────┘
```

## 🚀 Three Use Cases

1. **PUBLIC EMERGENCIES** (Earthquake/Disaster)
   - Anyone can send SOS
   - Anyone can help locate victims
   - Trigger: Triple power button press

2. **PROFESSIONAL RESCUE** (Fire/Police/EMT)
   - Certified rescuers only
   - Connects to emergency dispatch systems
   - Trigger: Long press + Volume Down

3. **PRIVATE GROUPS** (Hiking/Outdoors)
   - Pre-formed groups of friends/family
   - Only group members see each other
   - Trigger: In-app button

## 📁 Project Structure

```
Flare/
├── src/                          # React Native Mobile App
│   ├── screens/
│   │   ├── HomeScreen.js         # Main entry with mode selection
│   │   ├── VictimScreen.js       # SOS beacon activation
│   │   ├── RescuerScreen.js      # Radar/scanner view
│   │   ├── HeatMapScreen.js      # 2D heat map navigator
│   │   ├── ARViewScreen.js       # AR camera view
│   │   ├── SettingsScreen.js     # App configuration
│   │   ├── GroupScreen.js        # Private groups
│   │   └── ProfessionalModeScreen.js
│   ├── services/
│   │   ├── BluetoothService.js   # BLE P2P logic
│   │   ├── WiFiService.js        # WiFi Direct
│   │   ├── SupabaseService.js    # Cloud sync
│   │   ├── NavigationService.js  # Distance/direction calc
│   │   └── HeatMapService.js     # Obstacle detection
│   ├── components/
│   │   ├── BeaconCard.js         # Victim card UI
│   │   ├── HeatMapCanvas.js      # Heat map visualization
│   │   ├── RadarView.js          # Radar screen
│   │   └── SignalStrength.js     # Signal indicator
│   ├── context/
│   │   ├── AppContext.js         # Global state
│   │   └── BluetoothContext.js   # Bluetooth state
│   └── utils/
│       ├── rssiCalculator.js     # RSSI → distance
│       └── constants.js          # App constants
│
└── flare_backend/                # Django REST API
    ├── api/
    │   ├── models.py             # Data models
    │   ├── serializers.py        # JSON serialization
    │   ├── views.py              # API endpoints
    │   └── urls.py               # API routes
    ├── flare_backend/
    │   ├── settings.py           # Django config
    │   └── urls.py               # URL routing
    └── requirements.txt
```

## 🛠️ Quick Start

### Backend Setup

```bash
# Navigate to backend
cd flare_backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run migrations
python manage.py migrate

# Start server
python manage.py runserver
```

API available at: `http://localhost:8000/api/`

### Mobile App Setup

```bash
# Navigate to mobile app
cd src

# Install dependencies
npm install

# iOS only
cd ios && pod install && cd ..

# Run on Android
npm run android

# Run on iOS
npm run ios
```

## 🔑 Environment Configuration

### Backend (.env)
```env
SECRET_KEY=your-secret-key
DEBUG=True
DATABASE_URL=postgresql://...  # Optional, uses SQLite by default
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### Mobile App
Update Supabase credentials in `src/services/SupabaseService.js`

## 📱 Required Permissions

### Android
- Bluetooth (Scan, Connect, Advertise)
- Location (Fine)
- WiFi State

### iOS
- Bluetooth
- Location When In Use
- Camera (for AR view)

## ✅ Key Features Checklist

- [x] One-tap SOS beacon activation
- [x] Bluetooth LE beacon broadcasting
- [x] Real-time beacon scanning
- [x] RSSI-based distance estimation
- [x] Navigation guidance (hot/cold)
- [x] 2D Heat Map visualization
- [x] Obstacle detection via signal analysis
- [x] Private groups with join codes
- [x] Professional rescuer mode
- [x] Battery priority sorting
- [x] Offline-first architecture
- [x] Cloud sync when available
- [x] AR View (stretch goal - UI ready)

## 🏗️ Architecture

```
┌─────────────┐    Bluetooth P2P    ┌─────────────┐
│   Victim    │◄───────────────────►│  Rescuer    │
│  Mobile App │                     │  Mobile App │
└──────┬──────┘                     └──────┬──────┘
       │                                   │
       │      (when internet available)    │
       │                                   │
       └────────► Supabase ◄───────────────┘
                      ↕
              Django REST API
```

**P2P is primary, cloud sync is secondary.**

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

---

**FLARE - Because every second counts in an emergency.**
