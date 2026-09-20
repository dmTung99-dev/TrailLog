import { Activity, ActivitiesRepository } from '../db/activitiesRepository';
import { ApiClient } from '../api/apiClient';

export interface SyncSummary {
  synced: number;
  conflicts: number;
  failed: number;
}

export function createSyncEngine(repo: ActivitiesRepository, apiClient: ApiClient) {
  async function pushActivity(activity: Activity): Promise<'synced' | 'conflict' | 'failed'> {
    try {
      let serverId = activity.serverId;
      let serverUpdatedAt = activity.updatedAt;
      let hadConflict = false;

      if (!serverId) {
        // Never reached the server at all yet — full create.
        const server = await apiClient.createActivity({
          title: activity.title,
          notes: activity.notes ?? undefined,
          startedAt: activity.startedAt,
          endedAt: activity.endedAt ?? undefined,
          routePoints: activity.routePoints.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt, sequence: p.sequence })),
        });
        serverId = server.id;
        serverUpdatedAt = server.updatedAt;
        await repo.markActivityServerId(activity.id, serverId, serverUpdatedAt);
      } else {
        // Already exists on the server — either resuming a sync that was
        // interrupted before its checkpoints finished, or this is a
        // genuine local metadata edit after a prior full sync. Push the
        // current local title/notes either way; harmless if nothing
        // changed since the server's last copy (markActivityServerId
        // keeps clientUpdatedAt in step with the server's own timestamp,
        // so a plain resume never looks like a conflict on its own).
        const result = await apiClient.updateActivityMetadata(serverId, {
          title: activity.title,
          notes: activity.notes ?? undefined,
          clientUpdatedAt: activity.updatedAt,
        });

        if ('conflict' in result) {
          // Record the conflict, but do NOT return yet: checkpoints/photos
          // are independent of the metadata dispute and must not be
          // abandoned just because title/notes collided. See the second
          // design note after this function.
          await repo.markActivityConflict(activity.id, JSON.stringify(result.serverActivity));
          hadConflict = true;
        } else {
          serverUpdatedAt = result.updatedAt;
        }
      }

      // Idempotent on purpose: skip any checkpoint/photo that already
      // reached the server on an earlier, interrupted attempt, so retrying
      // a partially-synced activity never re-creates a checkpoint. Runs
      // even when the metadata push above conflicted.
      for (const checkpoint of activity.checkpoints) {
        let serverCheckpointId = checkpoint.serverId;
        if (!serverCheckpointId) {
          const serverCheckpoint = await apiClient.createCheckpoint(serverId, {
            lat: checkpoint.lat,
            lng: checkpoint.lng,
            capturedAt: checkpoint.capturedAt,
          });
          serverCheckpointId = serverCheckpoint.id;
          await repo.markCheckpointSynced(checkpoint.id, serverCheckpointId);
        }

        if (checkpoint.photoPath && !checkpoint.photoUploaded) {
          await apiClient.uploadCheckpointPhoto(serverId, serverCheckpointId, {
            uri: checkpoint.photoPath,
            name: `${checkpoint.id}.jpg`,
            type: 'image/jpeg',
          });
          await repo.markCheckpointPhotoUploaded(checkpoint.id);
        }
      }

      if (hadConflict) {
        return 'conflict';
      }

      // Only now — the activity itself AND every checkpoint AND every
      // photo are all confirmed on the server — is this activity actually
      // fully synced and safe to drop from listPendingActivities().
      await repo.markActivitySynced(activity.id, serverId, serverUpdatedAt);
      return 'synced';
    } catch {
      return 'failed';
    }
  }

  return {
    async syncNow(): Promise<SyncSummary> {
      const summary: SyncSummary = { synced: 0, conflicts: 0, failed: 0 };
      const pending = await repo.listPendingActivities();

      for (const activity of pending) {
        const outcome = await pushActivity(activity);

        if (outcome === 'synced') summary.synced += 1;
        else if (outcome === 'conflict') summary.conflicts += 1;
        else summary.failed += 1;
      }

      return summary;
    },
  };
}
