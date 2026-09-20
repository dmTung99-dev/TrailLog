import { createSyncEngine } from './syncEngine';
import { createActivitiesRepository } from '../db/activitiesRepository';
import { createBetterSqliteAdapter } from '../../test/support/betterSqliteAdapter';
import { initSchema } from '../db/schema';

function fakeApiClient(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    register: jest.fn(),
    login: jest.fn(),
    listActivities: jest.fn(),
    createActivity: jest.fn().mockResolvedValue({ id: 'server-1', title: 'x', updatedAt: '2026-09-21T00:00:00.000Z' }),
    updateActivityMetadata: jest.fn(),
    createCheckpoint: jest.fn().mockResolvedValue({ id: 'server-checkpoint-1' }),
    uploadCheckpointPhoto: jest.fn().mockResolvedValue({ photoUrl: '/uploads/x.jpg' }),
    ...overrides,
  };
}

describe('createSyncEngine', () => {
  it('pushes a pending activity with its route points and marks it synced', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Morning hike', startedAt: '2026-09-21T07:00:00.000Z' });
    await repo.addRoutePoint(activityId, { lat: 10.1, lng: 106.1, recordedAt: '2026-09-21T07:00:00.000Z', sequence: 0 });

    const api = fakeApiClient();
    const engine = createSyncEngine(repo, api as any);

    const summary = await engine.syncNow();

    expect(summary).toEqual({ synced: 1, conflicts: 0, failed: 0 });
    expect(api.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Morning hike',
        routePoints: [expect.objectContaining({ lat: 10.1, lng: 106.1, sequence: 0 })],
      }),
    );

    const activity = await repo.getActivity(activityId);
    expect(activity?.serverId).toBe('server-1');
    expect(activity?.syncStatus).toBe('synced');
  });

  it('creates each checkpoint on the server and uploads its photo if one was captured', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Hike with a view', startedAt: '2026-09-21T08:00:00.000Z' });
    const checkpointId = await repo.addCheckpoint(activityId, { lat: 10.2, lng: 106.2, capturedAt: '2026-09-21T08:05:00.000Z' });
    await repo.setCheckpointPhotoPath(checkpointId, '/local/photo.jpg');

    const api = fakeApiClient();
    const engine = createSyncEngine(repo, api as any);

    await engine.syncNow();

    expect(api.createCheckpoint).toHaveBeenCalledWith('server-1', expect.objectContaining({ lat: 10.2, lng: 106.2 }));
    expect(api.uploadCheckpointPhoto).toHaveBeenCalledWith('server-1', 'server-checkpoint-1', expect.objectContaining({ uri: '/local/photo.jpg' }));

    const activity = await repo.getActivity(activityId);
    expect(activity?.checkpoints[0].serverId).toBe('server-checkpoint-1');
    expect(activity?.checkpoints[0].photoUploaded).toBe(true);
  });

  it('does not upload a photo for a checkpoint that never captured one', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'No photos', startedAt: '2026-09-21T09:00:00.000Z' });
    await repo.addCheckpoint(activityId, { lat: 10.3, lng: 106.3, capturedAt: '2026-09-21T09:05:00.000Z' });

    const api = fakeApiClient();
    const engine = createSyncEngine(repo, api as any);

    await engine.syncNow();

    expect(api.uploadCheckpointPhoto).not.toHaveBeenCalled();
  });

  it('leaves an activity pending (not synced) if the server call fails, and reports it as failed', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Will fail', startedAt: '2026-09-21T10:00:00.000Z' });

    const api = fakeApiClient({ createActivity: jest.fn().mockRejectedValue(new Error('network down')) });
    const engine = createSyncEngine(repo, api as any);

    const summary = await engine.syncNow();

    expect(summary).toEqual({ synced: 0, conflicts: 0, failed: 1 });
    const activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('pending');
  });

  it('marks a subsequent metadata edit as a conflict when the server reports one, without overwriting the local copy', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Already synced once', startedAt: '2026-09-21T11:00:00.000Z' });
    await repo.markActivitySynced(activityId, 'server-2', '2026-09-21T11:00:00.000Z');
    await repo.updateActivityMetadata(activityId, { title: 'Renamed on this phone' });

    const api = fakeApiClient({
      updateActivityMetadata: jest.fn().mockResolvedValue({
        conflict: true,
        serverActivity: { id: 'server-2', title: 'Renamed on the other phone', updatedAt: '2026-09-21T12:00:00.000Z' },
      }),
    });
    const engine = createSyncEngine(repo, api as any);

    const summary = await engine.syncNow();

    expect(summary).toEqual({ synced: 0, conflicts: 1, failed: 0 });
    const activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('conflict');
    expect(activity?.title).toBe('Renamed on this phone'); // never silently overwritten
    expect(JSON.parse(activity!.conflictServerActivity!).title).toBe('Renamed on the other phone');
  });
});
