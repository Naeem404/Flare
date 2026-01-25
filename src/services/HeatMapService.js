/**
 * FLARE HeatMap Service
 * Obstacle detection and path visualization through signal mapping
 */

import { HEAT_MAP_CONFIG, COLORS } from '../utils/constants';
import { classifyCellStatus } from '../utils/rssiCalculator';

class HeatMapService {
  constructor() {
    this.grid = new Map();
    this.gridSize = HEAT_MAP_CONFIG.GRID_SIZE;
    this.minX = 0;
    this.maxX = 0;
    this.minY = 0;
    this.maxY = 0;
    this.rescuerPosition = { x: 0, y: 0 };
    this.victimPosition = null;
    this.onGridUpdate = null;
    this.onCellUpdate = null;
  }

  initialize(gridSize = HEAT_MAP_CONFIG.GRID_SIZE) {
    this.grid.clear();
    this.gridSize = gridSize;
    this.minX = 0;
    this.maxX = 0;
    this.minY = 0;
    this.maxY = 0;
    this.rescuerPosition = { x: 0, y: 0 };
    this.victimPosition = null;
  }

  worldToGrid(worldX, worldY) {
    return {
      x: Math.floor(worldX / this.gridSize),
      y: Math.floor(worldY / this.gridSize),
    };
  }

  gridToWorld(gridX, gridY) {
    return {
      x: gridX * this.gridSize + this.gridSize / 2,
      y: gridY * this.gridSize + this.gridSize / 2,
    };
  }

  getCellKey(x, y) {
    return `${x},${y}`;
  }

  parseCellKey(key) {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  recordReading(worldX, worldY, rssi, additionalData = {}) {
    const gridPos = this.worldToGrid(worldX, worldY);
    const key = this.getCellKey(gridPos.x, gridPos.y);

    let cell = this.grid.get(key);

    if (!cell) {
      cell = {
        x: gridPos.x,
        y: gridPos.y,
        readings: [],
        status: HEAT_MAP_CONFIG.CELL_STATUSES.UNKNOWN,
        avgSignal: null,
        lastUpdated: null,
        visitCount: 0,
        latitude: additionalData.latitude,
        longitude: additionalData.longitude,
      };
    }

    cell.readings.push({
      rssi,
      timestamp: Date.now(),
      ...additionalData,
    });

    if (cell.readings.length > 20) {
      cell.readings = cell.readings.slice(-20);
    }

    const rssiValues = cell.readings.map((r) => r.rssi);
    cell.avgSignal = Math.round(
      rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length
    );
    cell.status = classifyCellStatus(rssiValues);
    cell.lastUpdated = Date.now();
    cell.visitCount++;

    this.grid.set(key, cell);

    this.minX = Math.min(this.minX, gridPos.x);
    this.maxX = Math.max(this.maxX, gridPos.x);
    this.minY = Math.min(this.minY, gridPos.y);
    this.maxY = Math.max(this.maxY, gridPos.y);

    if (this.onCellUpdate) {
      this.onCellUpdate(cell);
    }

    if (this.onGridUpdate) {
      this.onGridUpdate(this.getGridArray());
    }

    return cell;
  }

  updateRescuerPosition(worldX, worldY) {
    this.rescuerPosition = this.worldToGrid(worldX, worldY);
  }

  setVictimPosition(worldX, worldY) {
    this.victimPosition = this.worldToGrid(worldX, worldY);
  }

  getCell(gridX, gridY) {
    return this.grid.get(this.getCellKey(gridX, gridY));
  }

  getCellStatus(gridX, gridY) {
    const cell = this.getCell(gridX, gridY);
    return cell ? cell.status : HEAT_MAP_CONFIG.CELL_STATUSES.UNKNOWN;
  }

  getCellColor(status) {
    switch (status) {
      case HEAT_MAP_CONFIG.CELL_STATUSES.CLEAR:
        return COLORS.heatMapClear;
      case HEAT_MAP_CONFIG.CELL_STATUSES.UNSTABLE:
        return COLORS.heatMapUnstable;
      case HEAT_MAP_CONFIG.CELL_STATUSES.OBSTACLE:
        return COLORS.heatMapObstacle;
      default:
        return COLORS.heatMapUnknown;
    }
  }

  getGridArray() {
    const grid = [];

    for (let y = this.minY; y <= this.maxY; y++) {
      const row = [];
      for (let x = this.minX; x <= this.maxX; x++) {
        const cell = this.getCell(x, y);
        row.push({
          x,
          y,
          status: cell ? cell.status : HEAT_MAP_CONFIG.CELL_STATUSES.UNKNOWN,
          avgSignal: cell ? cell.avgSignal : null,
          color: this.getCellColor(
            cell ? cell.status : HEAT_MAP_CONFIG.CELL_STATUSES.UNKNOWN
          ),
          isRescuer: this.rescuerPosition.x === x && this.rescuerPosition.y === y,
          isVictim:
            this.victimPosition &&
            this.victimPosition.x === x &&
            this.victimPosition.y === y,
          visitCount: cell ? cell.visitCount : 0,
        });
      }
      grid.push(row);
    }

    return grid;
  }

  getGridBounds() {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
      width: this.maxX - this.minX + 1,
      height: this.maxY - this.minY + 1,
    };
  }

  findPath(startX, startY, endX, endY) {
    const start = this.worldToGrid(startX, startY);
    const end = this.worldToGrid(endX, endY);

    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(this.getCellKey(start.x, start.y), 0);
    fScore.set(
      this.getCellKey(start.x, start.y),
      this.heuristic(start, end)
    );

    while (openSet.length > 0) {
      openSet.sort((a, b) => {
        const fA = fScore.get(this.getCellKey(a.x, a.y)) || Infinity;
        const fB = fScore.get(this.getCellKey(b.x, b.y)) || Infinity;
        return fA - fB;
      });

      const current = openSet.shift();
      const currentKey = this.getCellKey(current.x, current.y);

      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(cameFrom, current);
      }

      const neighbors = this.getNeighbors(current);

      for (const neighbor of neighbors) {
        const neighborKey = this.getCellKey(neighbor.x, neighbor.y);
        const moveCost = this.getMoveCost(neighbor);

        const tentativeGScore =
          (gScore.get(currentKey) || Infinity) + moveCost;

        if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(
            neighborKey,
            tentativeGScore + this.heuristic(neighbor, end)
          );

          if (!openSet.some((n) => n.x === neighbor.x && n.y === neighbor.y)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return null;
  }

  heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  getNeighbors(pos) {
    const neighbors = [];
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 },
    ];

    for (const dir of directions) {
      const nx = pos.x + dir.dx;
      const ny = pos.y + dir.dy;
      const status = this.getCellStatus(nx, ny);

      if (status !== HEAT_MAP_CONFIG.CELL_STATUSES.OBSTACLE) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  getMoveCost(pos) {
    const status = this.getCellStatus(pos.x, pos.y);

    switch (status) {
      case HEAT_MAP_CONFIG.CELL_STATUSES.CLEAR:
        return 1;
      case HEAT_MAP_CONFIG.CELL_STATUSES.UNSTABLE:
        return 2;
      case HEAT_MAP_CONFIG.CELL_STATUSES.UNKNOWN:
        return 1.5;
      case HEAT_MAP_CONFIG.CELL_STATUSES.OBSTACLE:
        return Infinity;
      default:
        return 1;
    }
  }

  reconstructPath(cameFrom, current) {
    const path = [current];
    let currentKey = this.getCellKey(current.x, current.y);

    while (cameFrom.has(currentKey)) {
      current = cameFrom.get(currentKey);
      currentKey = this.getCellKey(current.x, current.y);
      path.unshift(current);
    }

    return path;
  }

  getSuggestedPath() {
    if (!this.victimPosition) {
      return null;
    }

    const worldRescuer = this.gridToWorld(
      this.rescuerPosition.x,
      this.rescuerPosition.y
    );
    const worldVictim = this.gridToWorld(
      this.victimPosition.x,
      this.victimPosition.y
    );

    return this.findPath(
      worldRescuer.x,
      worldRescuer.y,
      worldVictim.x,
      worldVictim.y
    );
  }

  getStatistics() {
    let clearCount = 0;
    let obstacleCount = 0;
    let unstableCount = 0;
    let unknownCount = 0;
    let totalSignal = 0;
    let signalCount = 0;

    for (const cell of this.grid.values()) {
      switch (cell.status) {
        case HEAT_MAP_CONFIG.CELL_STATUSES.CLEAR:
          clearCount++;
          break;
        case HEAT_MAP_CONFIG.CELL_STATUSES.OBSTACLE:
          obstacleCount++;
          break;
        case HEAT_MAP_CONFIG.CELL_STATUSES.UNSTABLE:
          unstableCount++;
          break;
        default:
          unknownCount++;
      }

      if (cell.avgSignal !== null) {
        totalSignal += cell.avgSignal;
        signalCount++;
      }
    }

    return {
      totalCells: this.grid.size,
      clearCells: clearCount,
      obstacleCells: obstacleCount,
      unstableCells: unstableCount,
      unknownCells: unknownCount,
      avgSignalStrength: signalCount > 0 ? Math.round(totalSignal / signalCount) : null,
      coverage: this.grid.size / ((this.maxX - this.minX + 1) * (this.maxY - this.minY + 1)),
    };
  }

  exportData() {
    const cells = [];

    for (const cell of this.grid.values()) {
      cells.push({
        x: cell.x,
        y: cell.y,
        status: cell.status,
        signalStrength: cell.avgSignal,
        latitude: cell.latitude,
        longitude: cell.longitude,
        visitCount: cell.visitCount,
      });
    }

    return {
      gridSize: this.gridSize,
      bounds: this.getGridBounds(),
      cells,
      statistics: this.getStatistics(),
    };
  }

  importData(data) {
    this.initialize(data.gridSize);

    for (const cell of data.cells) {
      const key = this.getCellKey(cell.x, cell.y);
      this.grid.set(key, {
        x: cell.x,
        y: cell.y,
        readings: [],
        status: cell.status,
        avgSignal: cell.signalStrength,
        lastUpdated: Date.now(),
        visitCount: cell.visitCount || 1,
        latitude: cell.latitude,
        longitude: cell.longitude,
      });
    }

    if (data.bounds) {
      this.minX = data.bounds.minX;
      this.maxX = data.bounds.maxX;
      this.minY = data.bounds.minY;
      this.maxY = data.bounds.maxY;
    }
  }

  reset() {
    this.grid.clear();
    this.minX = 0;
    this.maxX = 0;
    this.minY = 0;
    this.maxY = 0;
    this.rescuerPosition = { x: 0, y: 0 };
    this.victimPosition = null;
  }
}

export default new HeatMapService();
