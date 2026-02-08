/**
 * FLARE HeatMap Canvas Component
 * 2D grid visualization for signal mapping
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { COLORS, HEAT_MAP_CONFIG } from '../utils/constants';

const { width } = Dimensions.get('window');

const HeatMapCanvas = ({
  gridData,
  currentPosition,
  victimPosition,
  suggestedPath,
  cellSize = 30,
}) => {
  const getCellColor = (status) => {
    switch (status) {
      case HEAT_MAP_CONFIG.CELL_STATUSES.CLEAR:
        return COLORS.heatMapClear;
      case HEAT_MAP_CONFIG.CELL_STATUSES.OBSTACLE:
        return COLORS.heatMapObstacle;
      case HEAT_MAP_CONFIG.CELL_STATUSES.UNSTABLE:
        return COLORS.heatMapUnstable;
      default:
        return COLORS.heatMapUnknown;
    }
  };

  const isOnPath = (x, y) => {
    if (!suggestedPath) return false;
    return suggestedPath.some((point) => point.x === x && point.y === y);
  };

  const renderCell = (cell, rowIndex, colIndex) => {
    const isRescuer = cell.isRescuer;
    const isVictim = cell.isVictim;
    const onPath = isOnPath(cell.x, cell.y);

    return (
      <View
        key={`${rowIndex}-${colIndex}`}
        style={[
          styles.cell,
          {
            width: cellSize,
            height: cellSize,
            backgroundColor: getCellColor(cell.status),
          },
          onPath && styles.pathCell,
          isRescuer && styles.rescuerCell,
          isVictim && styles.victimCell,
        ]}
      >
        {isRescuer && (
          <Icon name="account" size={cellSize * 0.6} color={COLORS.text} />
        )}
        {isVictim && (
          <Icon name="map-marker" size={cellSize * 0.6} color={COLORS.text} />
        )}
        {!isRescuer && !isVictim && cell.visitCount > 0 && (
          <Text style={styles.visitCount}>{cell.visitCount}</Text>
        )}
      </View>
    );
  };

  const renderGrid = () => {
    if (!gridData || gridData.length === 0) {
      return (
        <View style={styles.emptyGrid}>
          <Icon name="grid" size={60} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No data recorded yet</Text>
          <Text style={styles.emptySubtext}>
            Move around to build the heat map
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScroll}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.verticalScroll}
        >
          <View style={styles.grid}>
            {gridData.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((cell, colIndex) => renderCell(cell, rowIndex, colIndex))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    );
  };

  const renderCoordinates = () => (
    <View style={styles.coordinates}>
      <Text style={styles.coordinateText}>
        Position: ({currentPosition.x.toFixed(1)}, {currentPosition.y.toFixed(1)})
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderGrid()}
      {renderCoordinates()}
      
      <View style={styles.miniLegend}>
        <View style={styles.legendItem}>
          <Icon name="account" size={16} color={COLORS.info} />
          <Text style={styles.legendText}>You</Text>
        </View>
        <View style={styles.legendItem}>
          <Icon name="map-marker" size={16} color={COLORS.primary} />
          <Text style={styles.legendText}>Victim</Text>
        </View>
        {suggestedPath && (
          <View style={styles.legendItem}>
            <View style={[styles.pathIndicator]} />
            <Text style={styles.legendText}>Path</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundLight,
  },
  horizontalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  verticalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  grid: {
    padding: 10,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pathCell: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  rescuerCell: {
    backgroundColor: COLORS.info,
  },
  victimCell: {
    backgroundColor: COLORS.primary,
  },
  visitCount: {
    fontSize: 8,
    fontWeight: '400',
    color: COLORS.textPrimary,
    opacity: 0.6,
  },
  emptyGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textMuted,
    marginTop: 6,
  },
  coordinates: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  coordinateText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
  miniLegend: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 10,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  pathIndicator: {
    width: 18,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});

export default HeatMapCanvas;
