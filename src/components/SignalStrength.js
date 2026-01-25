/**
 * FLARE Signal Strength Component
 * Visual indicator for Bluetooth signal strength
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../utils/constants';
import { getSignalQuality } from '../utils/rssiCalculator';

const SignalStrength = ({ rssi, size = 'medium', showLabel = true, showValue = false }) => {
  const quality = getSignalQuality(rssi);
  
  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return { barWidth: 4, barGap: 2, heights: [6, 10, 14, 18, 22] };
      case 'large':
        return { barWidth: 8, barGap: 4, heights: [12, 20, 28, 36, 44] };
      default:
        return { barWidth: 6, barGap: 3, heights: [8, 14, 20, 26, 32] };
    }
  };

  const config = getSizeConfig();
  const activeBars = quality.bars;

  return (
    <View style={styles.container}>
      <View style={styles.barsContainer}>
        {config.heights.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                width: config.barWidth,
                height,
                marginHorizontal: config.barGap / 2,
                backgroundColor: index < activeBars ? quality.color : COLORS.border,
              },
            ]}
          />
        ))}
      </View>
      
      {showLabel && (
        <Text style={[styles.label, { color: quality.color }]}>
          {quality.level.replace('_', ' ')}
        </Text>
      )}
      
      {showValue && (
        <Text style={styles.value}>{rssi} dBm</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    borderRadius: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  value: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default SignalStrength;
