// src/store/trackingStore.ts
import { create } from 'zustand';
import { ActivitiesRepository, createActivitiesRepository, CheckpointInput } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';
import { LocationTrackingService } from '../tracking/locationTrackingService';
import { PedometerService } from '../sensors/pedometerService';

interface TrackingStoreState {
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  activityId: string | null;
  stepCount: number;
  checkpointCount: number;
  startActivity: () => Promise<void>;
  pauseActivity: () => void;
  resumeActivity: () => void;
  stopActivity: () => Promise<void>;
  captureCheckpoint: (input: CheckpointInput) => Promise<void>;
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

  return {
    status: 'idle',
    activityId: null,
    stepCount: 0,
    checkpointCount: 0,

    async startActivity() {
      // Guard against creating a second LocationTrackingService instance
      // while a previous one is still live. react-native-background-actions
      // has no per-instance isolation — it manages a single process-wide
      // native task — so two overlapping instances would each try to
      // register a keep-alive task against that same singleton, exactly
      // the class of bug Task 5 spent four review rounds fixing. Only
      // proceed if there is no existing instance, or the existing instance
      // has already reached the terminal 'stopped' state.
      //
      // Note: this checks the store's own `status` rather than
      // `locationService.state` directly. The two are always kept in sync
      // by this store (status is set to 'stopped' only after stop() has
      // returned, and LocationTrackingService's state machine transitions
      // synchronously), so they carry the same information here — but
      // relying on the store's own field keeps this guard correct even
      // against a locationService stand-in that doesn't expose `.state`.
      if (locationService !== null && get().status !== 'stopped') {
        return;
      }

      const repo = await getRepository();
      const activityId = await repo.createActivity({ title: 'Untitled activity', startedAt: new Date().toISOString() });
      set({ activityId, status: 'recording', stepCount: 0, checkpointCount: 0 });

      locationService = new LocationTrackingService((point) => {
        repo.addRoutePoint(activityId, point);
      });
      locationService.start();

      pedometerService = new PedometerService();
      pedometerService.start((count) => set({ stepCount: count }));
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
      locationService?.stop();
      pedometerService?.stop();
      set({ status: 'stopped' });
    },

    async captureCheckpoint(input) {
      const { activityId, checkpointCount } = get();
      if (!activityId) return;
      const repo = await getRepository();
      await repo.addCheckpoint(activityId, input);
      set({ checkpointCount: checkpointCount + 1 });
    },

    __setRepositoryForTest(repo) {
      testRepository = repo;
    },
  };
});
