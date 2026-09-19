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
