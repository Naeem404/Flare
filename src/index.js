/**
 * FLARE - Emergency Rescue Beacon Application
 * Entry point for Expo app
 */

console.log('DEBUG: Starting FLARE app...');

import { registerRootComponent } from 'expo';
import App from './App';

console.log('DEBUG: App imported:', App);
console.log('DEBUG: Registering root component...');

registerRootComponent(App);

console.log('DEBUG: Root component registered');
