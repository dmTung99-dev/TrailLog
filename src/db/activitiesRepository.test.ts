import { createBetterSqliteAdapter } from '../../test/support/betterSqliteAdapter';
import { initSchema } from './schema';
import { createActivitiesRepository } from './activitiesRepository';

describe('activitiesRepository', () => {
  it('creates an activity, adds route points and a checkpoint, then reads them back', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({
      title: 'Evening walk',
      startedAt: '2026-09-06T18:00:00.000Z',
    });

    await repo.addRoutePoint(activityId, { lat: 10.1, lng: 106.1, recordedAt: '2026-09-06T18:00:00.000Z', sequence: 0 });
    await repo.addRoutePoint(activityId, { lat: 10.2, lng: 106.2, recordedAt: '2026-09-06T18:05:00.000Z', sequence: 1 });
    const checkpointId = await repo.addCheckpoint(activityId, { lat: 10.15, lng: 106.15, capturedAt: '2026-09-06T18:02:00.000Z' });

    const activity = await repo.getActivity(activityId);
    expect(activity?.title).toBe('Evening walk');
    expect(activity?.routePoints).toHaveLength(2);
    expect(activity?.checkpoints).toHaveLength(1);
    expect(activity?.checkpoints[0].id).toBe(checkpointId);
  });

  it('lists activities most recent first', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    await repo.createActivity({ title: 'First', startedAt: '2026-09-01T08:00:00.000Z' });
    await repo.createActivity({ title: 'Second', startedAt: '2026-09-05T08:00:00.000Z' });

    const list = await repo.listActivities();
    expect(list.map((a) => a.title)).toEqual(['Second', 'First']);
  });

  it('updates activity metadata', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({ title: 'Untitled', startedAt: '2026-09-06T08:00:00.000Z' });
    await repo.updateActivityMetadata(activityId, { title: 'Renamed', notes: 'Nice view' });

    const activity = await repo.getActivity(activityId);
    expect(activity?.title).toBe('Renamed');
    expect(activity?.notes).toBe('Nice view');
  });
});

describe('sync-related repository methods', () => {
  it('lists only activities whose sync_status is pending, and marks one as synced', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({ title: 'Trail run', startedAt: '2026-09-21T07:00:00.000Z' });

    const pendingBefore = await repo.listPendingActivities();
    expect(pendingBefore.map((a) => a.id)).toContain(activityId);

    await repo.markActivitySynced(activityId, 'server-activity-1', '2026-09-21T08:00:00.000Z');

    const pendingAfter = await repo.listPendingActivities();
    expect(pendingAfter.map((a) => a.id)).not.toContain(activityId);

    const activity = await repo.getActivity(activityId);
    expect(activity?.serverId).toBe('server-activity-1');
    expect(activity?.syncStatus).toBe('synced');
  });

  it('records a conflict snapshot without changing sync_status back to pending', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({ title: 'Evening walk', startedAt: '2026-09-21T18:00:00.000Z' });
    await repo.markActivitySynced(activityId, 'server-activity-2', '2026-09-21T18:30:00.000Z');

    await repo.markActivityConflict(activityId, JSON.stringify({ id: 'server-activity-2', title: 'Renamed on phone B' }));

    const activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('conflict');
    expect(JSON.parse(activity!.conflictServerActivity!)).toMatchObject({ title: 'Renamed on phone B' });
  });

  it('moves a synced activity back to pending when its metadata is edited locally, so it is re-synced', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({ title: 'Already synced once', startedAt: '2026-09-21T11:00:00.000Z' });
    await repo.markActivitySynced(activityId, 'server-2', '2026-09-21T11:00:00.000Z');

    await repo.updateActivityMetadata(activityId, { title: 'Renamed on this phone' });

    const activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('pending');

    const pending = await repo.listPendingActivities();
    expect(pending.map((a) => a.id)).toContain(activityId);
  });

  it('marks a checkpoint synced, then its photo uploaded, independently', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);

    const activityId = await repo.createActivity({ title: 'Hike', startedAt: '2026-09-21T09:00:00.000Z' });
    const checkpointId = await repo.addCheckpoint(activityId, { lat: 10.1, lng: 106.1, capturedAt: '2026-09-21T09:05:00.000Z' });

    await repo.markCheckpointSynced(checkpointId, 'server-checkpoint-1');
    let activity = await repo.getActivity(activityId);
    expect(activity?.checkpoints[0].serverId).toBe('server-checkpoint-1');
    expect(activity?.checkpoints[0].photoUploaded).toBe(false);

    await repo.markCheckpointPhotoUploaded(checkpointId);
    activity = await repo.getActivity(activityId);
    expect(activity?.checkpoints[0].photoUploaded).toBe(true);
  });
});
