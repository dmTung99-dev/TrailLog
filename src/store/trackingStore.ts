// src/store/trackingStore.ts
import { create } from 'zustand';
import { ActivitiesRepository, createActivitiesRepository, RoutePointInput } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';
import { LocationTrackingService } from '../tracking/locationTrackingService';
import { PedometerService } from '../sensors/pedometerService';
import { requestLocationPermission, requestMotionPermission } from '../permissions/permissionsManager';

interface TrackingStoreState {
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  activityId: string | null;
  stepCount: number;
  checkpointCount: number;
  routePoints: RoutePointInput[];
  startActivity: () => Promise<void>;
  pauseActivity: () => void;
  resumeActivity: () => void;
  stopActivity: () => Promise<void>;
  captureCheckpoint: (photoPath: string) => Promise<void>;
  __setRepositoryForTest: (repo: ActivitiesRepository) => void;
}

let repositoryPromise: Promise<ActivitiesRepository> | null = null;
let testRepository: ActivitiesRepository | null = null;

async function getRepository(): Promise<ActivitiesRepository> {
  if (testRepository) return testRepository;
  if (!repositoryPromise) {
    repositoryPromise = createSqliteStorageAdapter().then(createActivitiesRepository);
  }
  return repositoryPromise;
}

export const useTrackingStore = create<TrackingStoreState>((set, get) => {
  let locationService: LocationTrackingService | null = null;
  let pedometerService: PedometerService | null = null;
  let lastKnownPosition: { lat: number; lng: number } | null = null;
  let starting = false;

  return {
    status: 'idle',
    activityId: null,
    stepCount: 0,
    checkpointCount: 0,
    routePoints: [],

    async startActivity() {
      // `starting` is set synchronously, before any `await` below — a
      // second call arriving while this one is still setting up (a fast
      // double-tap on Start, mid-way through opening the SQLite
      // connection) must not fall through and construct a second
      // LocationTrackingService against the same native background-task
      // singleton (see Task 5's review history: that library has no
      // per-instance isolation).
      if (starting || (locationService !== null && get().status !== 'stopped')) {
        return;
      }
      starting = true;

      try {
        // The OS permission prompt must be answered before we touch
        // location/camera/motion APIs at all. A denied/restricted result
        // means we must not create an activity row or start any tracking.
        const locationPermission = await requestLocationPermission();
        if (locationPermission === 'denied' || locationPermission === 'restricted') {
          return;
        }

        const repo = await getRepository();
        const activityId = await repo.createActivity({
          title: 'Untitled activity',
          startedAt: new Date().toISOString(),
        });
        set({ activityId, status: 'recording', stepCount: 0, checkpointCount: 0, routePoints: [] });
        lastKnownPosition = null;

        locationService = new LocationTrackingService((point) => {
          repo.addRoutePoint(activityId, point);
          lastKnownPosition = { lat: point.lat, lng: point.lng };
          set((state) => ({ routePoints: [...state.routePoints, point] }));
        });
        locationService.start();

        // Motion permission is best-effort: whatever it resolves to, we
        // still start the pedometer. A denial just means steps won't be
        // counted, which is an acceptable degradation, not a hard failure.
        await requestMotionPermission();
        pedometerService = new PedometerService();
        pedometerService.start((count) => set({ stepCount: count }));
      } finally {
        starting = false;
      }
    },

    pauseActivity() {
      locationService?.pause();
      set({ status: 'paused' });
    },

    resumeActivity() {
      locationService?.resume();
      set({ status: 'recording' });
    },

    async stopActivity() {
      // Wait for the native background-task teardown to actually finish
      // before flipping status to 'stopped' — otherwise a fast Stop-then-
      // Start can call BackgroundActions.start() for a new task before the
      // previous BackgroundActions.stop() has torn down the prior one.
      await locationService?.stop();
      pedometerService?.stop();
      set({ status: 'stopped' });
    },

    async captureCheckpoint(photoPath) {
      const { activityId, checkpointCount } = get();
      if (!activityId || !lastKnownPosition) return;
      const repo = await getRepository();
      const checkpointId = await repo.addCheckpoint(activityId, {
        lat: lastKnownPosition.lat,
        lng: lastKnownPosition.lng,
        capturedAt: new Date().toISOString(),
      });
      await repo.setCheckpointPhotoPath(checkpointId, photoPath);
      set({ checkpointCount: checkpointCount + 1 });
    },

    __setRepositoryForTest(repo) {
      testRepository = repo;
    },
  };
});
