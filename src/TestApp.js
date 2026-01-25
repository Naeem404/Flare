/**
 * Minimal Test App to debug require error
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TestApp = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>FLARE Test App</Text>
      <Text style={styles.subtext}>If you see this, basic imports work!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  subtext: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 10,
  },
});

export default TestApp;
