import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { SqlDatabase } from './sqlDatabase';

export interface RoutePointInput {
  lat: number;
  lng: number;
  recordedAt: string;
  sequence: number;
}

export interface CheckpointInput {
  lat: number;
  lng: number;
  capturedAt: string;
}

export interface Activity {
  id: string;
  title: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  syncStatus: string;
  updatedAt: string;
  serverId: string | null;
  conflictServerActivity: string | null;
  routePoints: Array<RoutePointInput & { id: string }>;
  checkpoints: Array<CheckpointInput & { id: string; photoPath: string | null; serverId: string | null; photoUploaded: boolean }>;
}

export interface ActivitiesRepository {
  createActivity(input: { title: string; startedAt: string }): Promise<string>;
  addRoutePoint(activityId: string, point: RoutePointInput): Promise<string>;
  addCheckpoint(activityId: string, checkpoint: CheckpointInput): Promise<string>;
  setCheckpointPhotoPath(checkpointId: string, photoPath: string): Promise<void>;
  getActivity(activityId: string): Promise<Activity | null>;
  listActivities(): Promise<Activity[]>;
  updateActivityMetadata(activityId: string, changes: { title?: string; notes?: string }): Promise<void>;
  listPendingActivities(): Promise<Activity[]>;
  markActivitySynced(activityId: string, serverId: string, serverUpdatedAt: string): Promise<void>;
  markActivityServerId(activityId: string, serverId: string, serverUpdatedAt: string): Promise<void>;
  markActivityConflict(activityId: string, serverActivityJson: string): Promise<void>;
  markCheckpointSynced(checkpointId: string, serverId: string): Promise<void>;
  markCheckpointPhotoUploaded(checkpointId: string): Promise<void>;
}

export function createActivitiesRepository(db: SqlDatabase): ActivitiesRepository {
  async function hydrate(row: any): Promise<Activity> {
    const routePointsRes = await db.executeSql(
      'SELECT * FROM route_points WHERE activity_id = ? ORDER BY sequence ASC',
      [row.id],
    );
    const checkpointsRes = await db.executeSql('SELECT * FROM checkpoints WHERE activity_id = ?', [row.id]);
    return {
      id: row.id,
      title: row.title,
      notes: row.notes ?? null,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      syncStatus: row.sync_status,
      updatedAt: row.updated_at,
      serverId: row.server_id ?? null,
      conflictServerActivity: row.conflict_server_activity ?? null,
      routePoints: routePointsRes.rows.map((p: any) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        recordedAt: p.recorded_at,
        sequence: p.sequence,
      })),
      checkpoints: checkpointsRes.rows.map((c: any) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        capturedAt: c.captured_at,
        photoPath: c.photo_path ?? null,
        serverId: c.server_id ?? null,
        photoUploaded: Boolean(c.photo_uploaded),
      })),
    };
  }

  return {
    async createActivity(input) {
      const id = uuid();
      const now = new Date().toISOString();
      await db.executeSql(
        'INSERT INTO activities (id, title, notes, started_at, ended_at, sync_status, updated_at) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
        [id, input.title, input.startedAt, 'pending', now],
      );
      return id;
    },

    async addRoutePoint(activityId, point) {
      const id = uuid();
      await db.executeSql(
        'INSERT INTO route_points (id, activity_id, lat, lng, recorded_at, sequence) VALUES (?, ?, ?, ?, ?, ?)',
        [id, activityId, point.lat, point.lng, point.recordedAt, point.sequence],
      );
      return id;
    },

    async addCheckpoint(activityId, checkpoint) {
      const id = uuid();
      await db.executeSql(
        'INSERT INTO checkpoints (id, activity_id, lat, lng, captured_at, photo_path) VALUES (?, ?, ?, ?, ?, NULL)',
        [id, activityId, checkpoint.lat, checkpoint.lng, checkpoint.capturedAt],
      );
      return id;
    },

    async setCheckpointPhotoPath(checkpointId, photoPath) {
      await db.executeSql('UPDATE checkpoints SET photo_path = ? WHERE id = ?', [photoPath, checkpointId]);
    },

    async getActivity(activityId) {
      const res = await db.executeSql('SELECT * FROM activities WHERE id = ?', [activityId]);
      if (res.rows.length === 0) {
        return null;
      }
      return hydrate(res.rows[0]);
    },

    async listActivities() {
      const res = await db.executeSql('SELECT * FROM activities ORDER BY started_at DESC', []);
      return Promise.all(res.rows.map(hydrate));
    },

    async updateActivityMetadata(activityId, changes) {
      const now = new Date().toISOString();
      if (changes.title !== undefined) {
        await db.executeSql(
          "UPDATE activities SET title = ?, sync_status = 'pending', updated_at = ? WHERE id = ?",
          [changes.title, now, activityId],
        );
      }
      if (changes.notes !== undefined) {
        await db.executeSql(
          "UPDATE activities SET notes = ?, sync_status = 'pending', updated_at = ? WHERE id = ?",
          [changes.notes, now, activityId],
        );
      }
    },

    async listPendingActivities() {
      const res = await db.executeSql("SELECT * FROM activities WHERE sync_status = 'pending' ORDER BY started_at ASC", []);
      return Promise.all(res.rows.map(hydrate));
    },

    async markActivitySynced(activityId, serverId, serverUpdatedAt) {
      await db.executeSql(
        "UPDATE activities SET server_id = ?, sync_status = 'synced', updated_at = ? WHERE id = ?",
        [serverId, serverUpdatedAt, activityId],
      );
    },

    async markActivityServerId(activityId, serverId, serverUpdatedAt) {
      // Deliberately does NOT touch sync_status — the activity stays
      // 'pending' (visible to listPendingActivities()) until the sync
      // engine has also finished pushing every checkpoint and photo. See
      // the design note after Step 4 for why this split matters.
      //
      // DOES record the server's updated_at (unlike an earlier draft of
      // this method, which left it alone). Without this, a retried sync's
      // clientUpdatedAt would still be the *local creation* timestamp, and
      // the backend's own conflict rule (current.updatedAt > clientSawAt)
      // would read that stale value as a real conflict on every resume —
      // wrongly, since nothing has actually changed. See the second design
      // note after Step 4.
      await db.executeSql(
        'UPDATE activities SET server_id = ?, updated_at = ? WHERE id = ?',
        [serverId, serverUpdatedAt, activityId],
      );
    },

    async markActivityConflict(activityId, serverActivityJson) {
      await db.executeSql(
        "UPDATE activities SET sync_status = 'conflict', conflict_server_activity = ? WHERE id = ?",
        [serverActivityJson, activityId],
      );
    },

    async markCheckpointSynced(checkpointId, serverId) {
      await db.executeSql('UPDATE checkpoints SET server_id = ? WHERE id = ?', [serverId, checkpointId]);
    },

    async markCheckpointPhotoUploaded(checkpointId) {
      await db.executeSql('UPDATE checkpoints SET photo_uploaded = 1 WHERE id = ?', [checkpointId]);
    },
  };
}
