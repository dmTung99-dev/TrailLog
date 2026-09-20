// src/store/trackingStore.test.ts
import { useTrackingStore } from './trackingStore';
import { ActivitiesRepository, createActivitiesRepository } from '../db/activitiesRepository';
import { createBetterSqliteAdapter } from '../../test/support/betterSqliteAdapter';
import { initSchema } from '../db/schema';
import { requestLocationPermission, requestMotionPermission } from '../permissions/permissionsManager';

jest.mock('../tracking/locationTrackingService', () => {
  return {
    LocationTrackingService: jest.fn().mockImplementation((onRoutePoint: any) => ({
      start: () => onRoutePoint({ lat: 10.1, lng: 106.1, recordedAt: new Date().toISOString(), sequence: 0 }),
      pause: jest.fn(),
      resume: jest.fn(),
      // `trackingStore.stopActivity()` now awaits this — it must resolve,
      // not just be a bare jest.fn(), or the store would hang.
      stop: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('../sensors/pedometerService', () => ({
  PedometerService: jest.fn().mockImplementation(() => ({
    start: (onChange: (count: number) => void) => onChange(5),
    stop: jest.fn(),
  })),
}));

jest.mock('../permissions/permissionsManager', () => ({
  requestLocationPermission: jest.fn().mockResolvedValue('granted'),
  requestMotionPermission: jest.fn().mockResolvedValue('granted'),
}));

describe('useTrackingStore', () => {
  let repo: ActivitiesRepository;

  beforeEach(async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    repo = createActivitiesRepository(db);
    useTrackingStore.getState().__setRepositoryForTest(repo);
    // The store is a module-level singleton, so its zustand-visible state
    // (unlike the fresh `repo` above) persists across tests in this file.
    // Force it back to the guard's "safe to start" state before each test —
    // otherwise a prior test that ends mid-recording (e.g. the re-entrancy
    // test below, which deliberately never calls stopActivity()) would make
    // the next test's startActivity() silently no-op via the re-entrancy
    // guard, leaving activityId pointing at the previous test's database.
    useTrackingStore.setState({ status: 'stopped', activityId: null, stepCount: 0, checkpointCount: 0, routePoints: [] });
    (requestLocationPermission as jest.Mock).mockClear().mockResolvedValue('granted');
    (requestMotionPermission as jest.Mock).mockClear().mockResolvedValue('granted');
  });

  it('starts an activity and reflects the first route point and step count', async () => {
    await useTrackingStore.getState().startActivity();

    const state = useTrackingStore.getState();
    expect(state.status).toBe('recording');
    expect(state.stepCount).toBe(5);
    expect(state.activityId).not.toBeNull();
    expect(state.routePoints).toHaveLength(1);
  });

  it('requests location permission before starting and does not create an activity when it is denied', async () => {
    (requestLocationPermission as jest.Mock).mockResolvedValueOnce('denied');

    await useTrackingStore.getState().startActivity();

    expect(requestLocationPermission).toHaveBeenCalled();
    expect(useTrackingStore.getState().activityId).toBeNull();
    expect(useTrackingStore.getState().status).not.toBe('recording');
    const activities = await repo.listActivities();
    expect(activities).toHaveLength(0);
  });

  it('also does not create an activity when location permission is restricted', async () => {
    (requestLocationPermission as jest.Mock).mockResolvedValueOnce('restricted');

    await useTrackingStore.getState().startActivity();

    expect(useTrackingStore.getState().activityId).toBeNull();
    const activities = await repo.listActivities();
    expect(activities).toHaveLength(0);
  });

  it('requests motion permission as part of starting, but still starts tracking when it resolves granted', async () => {
    await useTrackingStore.getState().startActivity();

    expect(requestMotionPermission).toHaveBeenCalled();
    expect(useTrackingStore.getState().status).toBe('recording');
  });

  it('stops the activity and resets to idle', async () => {
    await useTrackingStore.getState().startActivity();
    await useTrackingStore.getState().stopActivity();

    expect(useTrackingStore.getState().status).toBe('stopped');
  });

  it('ignores a second startActivity() call that fires before the first one finishes setting up', async () => {
    // Both calls read `starting`/`status` before either has awaited
    // anything — this is exactly the race a fast double-tap on Start can
    // trigger, and it must not construct two LocationTrackingService
    // instances against the same native background-task singleton (see
    // Task 5's review history).
    const first = useTrackingStore.getState().startActivity();
    const second = useTrackingStore.getState().startActivity();
    await Promise.all([first, second]);

    const activities = await repo.listActivities();
    expect(activities).toHaveLength(1);
  });

  it('captures a checkpoint at the last known position and attaches a photo path', async () => {
    await useTrackingStore.getState().startActivity();
    await useTrackingStore.getState().captureCheckpoint('/tmp/checkpoint.jpg');

    const { activityId, checkpointCount } = useTrackingStore.getState();
    expect(checkpointCount).toBe(1);

    const activity = await repo.getActivity(activityId!);
    expect(activity?.checkpoints).toHaveLength(1);
    expect(activity?.checkpoints[0]).toMatchObject({ lat: 10.1, lng: 106.1, photoPath: '/tmp/checkpoint.jpg' });
  });
});
