import { Activity, ActivitiesRepository } from '../db/activitiesRepository';
import { ApiClient } from '../api/apiClient';

export interface SyncSummary {
  synced: number;
  conflicts: number;
  failed: number;
}

export function createSyncEngine(repo: ActivitiesRepository, apiClient: ApiClient) {
  async function pushNewActivity(activity: Activity): Promise<'synced' | 'failed'> {
    try {
      const server = await apiClient.createActivity({
        title: activity.title,
        notes: activity.notes ?? undefined,
        startedAt: activity.startedAt,
        endedAt: activity.endedAt ?? undefined,
        routePoints: activity.routePoints.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt, sequence: p.sequence })),
      });
      await repo.markActivitySynced(activity.id, server.id, server.updatedAt);

      for (const checkpoint of activity.checkpoints) {
        const serverCheckpoint = await apiClient.createCheckpoint(server.id, {
          lat: checkpoint.lat,
          lng: checkpoint.lng,
          capturedAt: checkpoint.capturedAt,
        });
        await repo.markCheckpointSynced(checkpoint.id, serverCheckpoint.id);

        if (checkpoint.photoPath) {
          await apiClient.uploadCheckpointPhoto(server.id, serverCheckpoint.id, {
            uri: checkpoint.photoPath,
            name: `${checkpoint.id}.jpg`,
            type: 'image/jpeg',
          });
          await repo.markCheckpointPhotoUploaded(checkpoint.id);
        }
      }

      return 'synced';
    } catch {
      return 'failed';
    }
  }

  async function pushMetadataEdit(activity: Activity): Promise<'synced' | 'conflict' | 'failed'> {
    if (!activity.serverId) return 'failed';
    try {
      const result = await apiClient.updateActivityMetadata(activity.serverId, {
        title: activity.title,
        notes: activity.notes ?? undefined,
        clientUpdatedAt: activity.updatedAt,
      });

      if ('conflict' in result) {
        await repo.markActivityConflict(activity.id, JSON.stringify(result.serverActivity));
        return 'conflict';
      }

      await repo.markActivitySynced(activity.id, result.id, result.updatedAt);
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
        const outcome = activity.serverId ? await pushMetadataEdit(activity) : await pushNewActivity(activity);

        if (outcome === 'synced') summary.synced += 1;
        else if (outcome === 'conflict') summary.conflicts += 1;
        else summary.failed += 1;
      }

      return summary;
    },
  };
}
