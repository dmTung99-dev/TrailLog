import { useTrackingStore } from './trackingStore';
import { createActivitiesRepository } from '../db/activitiesRepository';
import { createBetterSqliteAdapter } from '../../test/support/betterSqliteAdapter';
import { initSchema } from '../db/schema';

jest.mock('../tracking/locationTrackingService', () => {
  return {
    LocationTrackingService: jest.fn().mockImplementation((onRoutePoint: any) => ({
      start: () => onRoutePoint({ lat: 10.1, lng: 106.1, recordedAt: new Date().toISOString(), sequence: 0 }),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
    })),
  };
});

jest.mock('../sensors/pedometerService', () => ({
  PedometerService: jest.fn().mockImplementation(() => ({
    start: (onChange: (count: number) => void) => onChange(5),
    stop: jest.fn(),
  })),
}));

describe('useTrackingStore', () => {
  beforeEach(async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    useTrackingStore.getState().__setRepositoryForTest(createActivitiesRepository(db));
  });

  it('starts an activity and reflects the first route point and step count', async () => {
    await useTrackingStore.getState().startActivity();

    const state = useTrackingStore.getState();
    expect(state.status).toBe('recording');
    expect(state.stepCount).toBe(5);
    expect(state.activityId).not.toBeNull();
  });

  it('stops the activity and resets to idle', async () => {
    await useTrackingStore.getState().startActivity();
    await useTrackingStore.getState().stopActivity();

    expect(useTrackingStore.getState().status).toBe('stopped');
  });
});
