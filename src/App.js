/**
 * FLARE - Emergency Rescue Beacon Application
 * Main App Component with Navigation
 */

import React from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

import HomeScreen from './screens/HomeScreen';
import VictimScreen from './screens/VictimScreen';
import RescuerScreen from './screens/RescuerScreen';
import HeatMapScreen from './screens/HeatMapScreen';
import ManualMapScreen from './screens/ManualMapScreen';
import LiveMapScreen from './screens/LiveMapScreen';
import CombinedMapScreen from './screens/CombinedMapScreen';
import RadarMapScreen from './screens/RadarMapScreen';
import ARViewScreen from './screens/ARViewScreen';
import SettingsScreen from './screens/SettingsScreen';
import GroupScreen from './screens/GroupScreen';
import ProfessionalModeScreen from './screens/ProfessionalModeScreen';

import { AppProvider } from './context/AppContext';
import { BluetoothProvider } from './context/BluetoothContext';
import { COLORS } from './utils/constants';

LogBox.ignoreLogs(['new NativeEventEmitter']);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const RescuerTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          switch (route.name) {
            case 'Radar':
              iconName = focused ? 'radar' : 'radar';
              break;
            case 'HeatMap':
              iconName = focused ? 'map-marker-radius' : 'map-marker-radius-outline';
              break;
            case 'ARView':
              iconName = focused ? 'camera' : 'camera-outline';
              break;
            default:
              iconName = 'help-circle';
          }
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          paddingBottom: 5,
          height: 60,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Radar" component={RescuerScreen} />
      <Tab.Screen name="HeatMap" component={HeatMapScreen} />
      <Tab.Screen name="ARView" component={ARViewScreen} />
    </Tab.Navigator>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <BluetoothProvider>
          <NavigationContainer>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerStyle: {
                  backgroundColor: COLORS.background,
                },
                headerTintColor: COLORS.text,
                headerTitleStyle: {
                  fontWeight: 'bold',
                },
                contentStyle: {
                  backgroundColor: COLORS.background,
                },
              }}
            >
              <Stack.Screen 
                name="Home" 
                component={HomeScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="Victim" 
                component={VictimScreen}
                options={{ 
                  title: 'SOS Beacon',
                  headerBackTitle: 'Back',
                }}
              />
              <Stack.Screen 
                name="Rescuer" 
                component={RescuerTabs}
                options={{ 
                  title: 'FLARE Scanner',
                  headerBackTitle: 'Back',
                }}
              />
              <Stack.Screen 
                name="Settings" 
                component={SettingsScreen}
                options={{ title: 'Settings' }}
              />
              <Stack.Screen 
                name="Group" 
                component={GroupScreen}
                options={{ title: 'Private Groups' }}
              />
              <Stack.Screen 
                name="Professional" 
                component={ProfessionalModeScreen}
                options={{ title: 'Professional Mode' }}
              />
              <Stack.Screen 
                name="ManualMap" 
                component={ManualMapScreen}
                options={{ title: 'Manual Map' }}
              />
              <Stack.Screen 
                name="LiveMap" 
                component={LiveMapScreen}
                options={{ title: 'Live Map' }}
              />
              <Stack.Screen 
                name="CombinedMap" 
                component={CombinedMapScreen}
                options={{ title: 'Combined Map' }}
              />
              <Stack.Screen
                name="RadarMap"
                component={RadarMapScreen}
                options={{ title: 'Radar Map' }}
              />
              <Stack.Screen
                name="HeatMap"
                component={HeatMapScreen}
                options={{ title: 'Heat Map' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </BluetoothProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
};

export default App;
