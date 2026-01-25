/**
 * FLARE Supabase Service
 * Cloud synchronization and data persistence
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

class SupabaseService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.isOnline = false;
    this.pendingSync = [];
    this.syncInterval = null;
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });

      NetInfo.addEventListener((state) => {
        this.isOnline = state.isConnected && state.isInternetReachable;
        if (this.isOnline) {
          this.processPendingSync();
        }
      });

      const netState = await NetInfo.fetch();
      this.isOnline = netState.isConnected && netState.isInternetReachable;

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('SupabaseService initialization error:', error);
      throw error;
    }
  }

  async createBeacon(beaconData) {
    const data = {
      device_id: beaconData.deviceId,
      device_name: beaconData.deviceName,
      mode: beaconData.mode || 'public',
      status: 'active',
      signal_type: beaconData.signalType || 'bluetooth',
      battery_level: beaconData.batteryLevel || 100,
      last_known_latitude: beaconData.latitude,
      last_known_longitude: beaconData.longitude,
      message: beaconData.message,
      emergency_type: beaconData.emergencyType,
      private_group: beaconData.groupId,
    };

    if (!this.isOnline) {
      this.queueForSync('createBeacon', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }

    try {
      const { data: result, error } = await this.client
        .from('sos_beacons')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return { ...result, synced: true };
    } catch (error) {
      console.error('Create beacon error:', error);
      this.queueForSync('createBeacon', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }
  }

  async updateBeaconStatus(beaconId, status) {
    const data = { status, updated_at: new Date().toISOString() };

    if (!this.isOnline) {
      this.queueForSync('updateBeaconStatus', { beaconId, ...data });
      return { success: true, synced: false };
    }

    try {
      const { error } = await this.client
        .from('sos_beacons')
        .update(data)
        .eq('id', beaconId);

      if (error) throw error;
      return { success: true, synced: true };
    } catch (error) {
      console.error('Update beacon status error:', error);
      this.queueForSync('updateBeaconStatus', { beaconId, ...data });
      return { success: true, synced: false };
    }
  }

  async updateBeaconBattery(beaconId, batteryLevel) {
    const data = { battery_level: batteryLevel, updated_at: new Date().toISOString() };

    if (!this.isOnline) {
      this.queueForSync('updateBeaconBattery', { beaconId, ...data });
      return { success: true, synced: false };
    }

    try {
      const { error } = await this.client
        .from('sos_beacons')
        .update(data)
        .eq('id', beaconId);

      if (error) throw error;
      return { success: true, synced: true };
    } catch (error) {
      console.error('Update beacon battery error:', error);
      return { success: false, synced: false };
    }
  }

  async getActiveBeacons(mode = 'public', groupId = null) {
    if (!this.isOnline) {
      return this.getLocalBeacons(mode, groupId);
    }

    try {
      let query = this.client
        .from('sos_beacons')
        .select('*')
        .eq('status', 'active');

      if (mode === 'public') {
        query = query.eq('mode', 'public');
      } else if (mode === 'private' && groupId) {
        query = query.eq('mode', 'private').eq('private_group', groupId);
      } else if (mode === 'professional') {
        query = query.in('mode', ['public', 'professional']);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Get active beacons error:', error);
      return this.getLocalBeacons(mode, groupId);
    }
  }

  async getLocalBeacons(mode, groupId) {
    try {
      const stored = await AsyncStorage.getItem('flare_local_beacons');
      if (!stored) return [];

      let beacons = JSON.parse(stored);

      if (mode === 'public') {
        beacons = beacons.filter((b) => b.mode === 'public');
      } else if (mode === 'private' && groupId) {
        beacons = beacons.filter((b) => b.mode === 'private' && b.private_group === groupId);
      }

      return beacons;
    } catch (error) {
      console.error('Get local beacons error:', error);
      return [];
    }
  }

  async recordDetection(detectionData) {
    const data = {
      beacon: detectionData.beaconId,
      rescuer_device_id: detectionData.rescuerDeviceId,
      rssi: detectionData.rssi,
      estimated_distance: detectionData.distance,
      signal_type: detectionData.signalType || 'bluetooth',
      rescuer_latitude: detectionData.latitude,
      rescuer_longitude: detectionData.longitude,
    };

    if (!this.isOnline) {
      this.queueForSync('recordDetection', data);
      return { success: true, synced: false };
    }

    try {
      const { error } = await this.client.from('beacon_detections').insert(data);

      if (error) throw error;
      return { success: true, synced: true };
    } catch (error) {
      console.error('Record detection error:', error);
      return { success: false, synced: false };
    }
  }

  async createRescueSession(sessionData) {
    const data = {
      beacon: sessionData.beaconId,
      rescuer_device_id: sessionData.rescuerDeviceId,
      status: 'active',
      notes: sessionData.notes,
    };

    if (!this.isOnline) {
      this.queueForSync('createRescueSession', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }

    try {
      const { data: result, error } = await this.client
        .from('rescue_sessions')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return { ...result, synced: true };
    } catch (error) {
      console.error('Create rescue session error:', error);
      this.queueForSync('createRescueSession', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }
  }

  async completeRescueSession(sessionId, notes = null) {
    const data = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      notes,
    };

    if (!this.isOnline) {
      this.queueForSync('completeRescueSession', { sessionId, ...data });
      return { success: true, synced: false };
    }

    try {
      const { error } = await this.client
        .from('rescue_sessions')
        .update(data)
        .eq('id', sessionId);

      if (error) throw error;
      return { success: true, synced: true };
    } catch (error) {
      console.error('Complete rescue session error:', error);
      return { success: false, synced: false };
    }
  }

  async saveHeatMapData(sessionId, cells) {
    if (!this.isOnline) {
      this.queueForSync('saveHeatMapData', { sessionId, cells });
      return { success: true, synced: false };
    }

    try {
      const data = cells.map((cell) => ({
        rescue_session: sessionId,
        grid_x: cell.x,
        grid_y: cell.y,
        signal_strength: cell.signalStrength,
        cell_status: cell.status,
        latitude: cell.latitude,
        longitude: cell.longitude,
      }));

      const { error } = await this.client.from('heat_map_data').upsert(data, {
        onConflict: 'rescue_session,grid_x,grid_y',
      });

      if (error) throw error;
      return { success: true, synced: true };
    } catch (error) {
      console.error('Save heat map data error:', error);
      return { success: false, synced: false };
    }
  }

  async createPrivateGroup(groupData) {
    const code = this.generateGroupCode();
    const data = {
      name: groupData.name,
      code,
      created_by: groupData.createdBy,
    };

    if (!this.isOnline) {
      this.queueForSync('createPrivateGroup', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }

    try {
      const { data: result, error } = await this.client
        .from('private_groups')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return { ...result, synced: true };
    } catch (error) {
      console.error('Create private group error:', error);
      this.queueForSync('createPrivateGroup', data);
      return { ...data, id: `local_${Date.now()}`, synced: false };
    }
  }

  async joinPrivateGroup(code, userId) {
    if (!this.isOnline) {
      throw new Error('Internet connection required to join a group');
    }

    try {
      const { data: group, error: groupError } = await this.client
        .from('private_groups')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (groupError || !group) {
        throw new Error('Invalid group code');
      }

      const { error: memberError } = await this.client
        .from('group_memberships')
        .insert({
          user: userId,
          group: group.id,
          role: 'member',
        });

      if (memberError && !memberError.message.includes('duplicate')) {
        throw memberError;
      }

      return group;
    } catch (error) {
      console.error('Join private group error:', error);
      throw error;
    }
  }

  generateGroupCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  queueForSync(operation, data) {
    this.pendingSync.push({
      operation,
      data,
      timestamp: Date.now(),
    });
    this.savePendingSync();
  }

  async savePendingSync() {
    try {
      await AsyncStorage.setItem('flare_pending_sync', JSON.stringify(this.pendingSync));
    } catch (error) {
      console.error('Save pending sync error:', error);
    }
  }

  async loadPendingSync() {
    try {
      const stored = await AsyncStorage.getItem('flare_pending_sync');
      if (stored) {
        this.pendingSync = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Load pending sync error:', error);
    }
  }

  async processPendingSync() {
    if (!this.isOnline || this.pendingSync.length === 0) {
      return;
    }

    const toProcess = [...this.pendingSync];
    this.pendingSync = [];

    for (const item of toProcess) {
      try {
        switch (item.operation) {
          case 'createBeacon':
            await this.createBeacon(item.data);
            break;
          case 'updateBeaconStatus':
            await this.updateBeaconStatus(item.data.beaconId, item.data.status);
            break;
          case 'recordDetection':
            await this.recordDetection(item.data);
            break;
          case 'createRescueSession':
            await this.createRescueSession(item.data);
            break;
          case 'saveHeatMapData':
            await this.saveHeatMapData(item.data.sessionId, item.data.cells);
            break;
          default:
            console.warn('Unknown sync operation:', item.operation);
        }
      } catch (error) {
        console.error('Sync operation failed:', item.operation, error);
        this.pendingSync.push(item);
      }
    }

    await this.savePendingSync();
  }

  subscribeToBeacons(mode, groupId, callback) {
    if (!this.client) return null;

    let filter = 'status=eq.active';
    if (mode === 'public') {
      filter += ',mode=eq.public';
    } else if (mode === 'private' && groupId) {
      filter += `,mode=eq.private,private_group=eq.${groupId}`;
    }

    const subscription = this.client
      .channel('beacons')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sos_beacons',
          filter,
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  unsubscribe(subscription) {
    if (subscription) {
      this.client.removeChannel(subscription);
    }
  }
}

export default new SupabaseService();
