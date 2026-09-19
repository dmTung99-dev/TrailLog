# TrailLog Mobile — Offline Tracking Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React Native app that records a GPS route (including while backgrounded), attaches geotagged photo checkpoints, counts steps, and stores everything locally — fully usable with zero backend or network dependency.

**Architecture:** Native capabilities (location, camera, accelerometer) are each wrapped behind a small service with a plain TypeScript interface, so their state-machine and formatting logic can be unit-tested without mocking native modules line-by-line. All persistent state lives in SQLite behind a single `SqlDatabase` interface; the app's real adapter wraps `react-native-sqlite-storage`, while tests use a `better-sqlite3`-backed adapter satisfying the same interface, so repository tests run real SQL instead of hand-rolled query mocks. A Zustand store is the only thing screens talk to directly.

**Tech Stack:** React Native (bare workflow) + TypeScript strict, React Navigation, Zustand, `react-native-sqlite-storage` (+ `better-sqlite3` as a dev-only test double), `react-native-permissions`, `react-native-sensors`, `react-native-geolocation-service` + `react-native-background-actions`, `react-native-vision-camera`, `react-native-maps`, Jest + `@testing-library/react-native`, Detox for one E2E path.

## Global Constraints

- State management is Zustand, not Redux Toolkit — decided for this plan because a solo project centered on native-module depth benefits more from low boilerplate than from Redux's middleware/devtools ceremony. (Spec left this open; this plan closes it.)
- Local storage is plain SQLite via `react-native-sqlite-storage`, accessed only through the `SqlDatabase` interface defined in Task 2 — no file in this plan calls the native SQLite module directly except the one adapter file. (Spec left WatermelonDB vs. SQLite open; SQLite wins here because the spec's custom conflict-resolution design would otherwise fight WatermelonDB's own built-in sync protocol.)
- This plan has **no network calls of any kind** — every feature must work with the device in airplane mode. Auth and backend sync are a separate plan.
- Location tracking uses `react-native-geolocation-service` + `react-native-background-actions` (free/open-source), not a paid SDK — chosen so the work actually touches real Android foreground-service and iOS background-mode configuration rather than delegating it to a black box.
- React Native bare workflow (not Expo managed), TypeScript strict mode.
- Every service wrapping a native module exposes a plain-data interface; state-machine and formatting logic inside each service must be extracted into pure, dependency-free functions/classes so they're unit-testable without mocking native calls.

---

### Task 1: Project scaffold, navigation shell, and CI

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `babel.config.js`
- Create: `metro.config.js`
- Create: `index.js`
- Create: `App.tsx`
- Create: `src/screens/HomeScreen.tsx`
- Create: `.github/workflows/mobile-ci.yml`
- Test: `src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running RN app shell with a `NavigationContainer` that every later task adds screens/routes to.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/App.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../../App';

it('renders the Home screen on launch', () => {
  render(<App />);
  expect(screen.getByText('TrailLog')).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest`
Expected: FAIL — `Cannot find module '../../App'`.

- [ ] **Step 3: Write the scaffold**

```json
// package.json
{
  "name": "TrailLogMobile",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "react-native start",
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-native": "0.75.4",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/native-stack": "^6.11.0",
    "react-native-screens": "^3.34.0",
    "react-native-safe-area-context": "^4.10.9",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@babel/preset-env": "^7.25.4",
    "@babel/runtime": "^7.25.4",
    "@react-native/babel-preset": "0.75.4",
    "@react-native/eslint-config": "0.75.4",
    "@react-native/metro-config": "0.75.4",
    "@react-native/typescript-config": "0.75.4",
    "@testing-library/react-native": "^12.7.2",
    "@types/jest": "^29.5.12",
    "@types/react": "^18.3.5",
    "better-sqlite3": "^11.3.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "react-test-renderer": "18.3.1",
    "typescript": "^5.4.5"
  }
}
```

```json
// tsconfig.json
{
  "extends": "@react-native/typescript-config/tsconfig.json",
  "compilerOptions": {
    "strict": true
  }
}
```

```javascript
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
```

```javascript
// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

module.exports = mergeConfig(getDefaultConfig(__dirname), {});
```

```javascript
// index.js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

```tsx
// src/screens/HomeScreen.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TrailLog</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
});
```

```tsx
// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';

export type RootStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TrailLog' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: exits 0. (Android/iOS native project folders are generated separately via `npx react-native init` conventions already assumed present; if this is a true from-scratch checkout, run `npx react-native init TrailLogMobile --template react-native-template-typescript` in a scratch directory first and copy its `android/`/`ios/` folders in, since those binary/native project files aren't hand-written in this plan.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest`
Expected: PASS — `renders the Home screen on launch`.

- [ ] **Step 6: Add CI**

```yaml
# .github/workflows/mobile-ci.yml
name: Mobile CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json babel.config.js metro.config.js index.js App.tsx src/screens/HomeScreen.tsx src/__tests__/App.test.tsx .github/workflows/mobile-ci.yml
git commit -m "feat: scaffold RN app shell with navigation and CI"
```

---

### Task 2: Local database layer (SQLite repository behind a testable interface)

**Files:**
- Create: `src/db/sqlDatabase.ts` (interface)
- Create: `src/db/sqliteStorageAdapter.ts` (production adapter over `react-native-sqlite-storage`)
- Create: `src/db/schema.ts`
- Create: `src/db/activitiesRepository.ts`
- Create: `test/support/betterSqliteAdapter.ts` (test-only adapter over `better-sqlite3`)
- Test: `src/db/activitiesRepository.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SqlDatabase` interface (`{ executeSql(sql, params?): Promise<{ rows: any[] }> }`) and `ActivitiesRepository` — `createActivity`, `addRoutePoint`, `addCheckpoint`, `getActivity`, `listActivities`, `updateActivityMetadata`, `setCheckpointPhotoPath` — used by every screen and by the sync engine in the follow-up plan. Their exact signatures below are the ones later tasks must match.

- [ ] **Step 1: Write the failing repository test (using the better-sqlite3 test adapter)**

```typescript
// test/support/betterSqliteAdapter.ts
import Database from 'better-sqlite3';
import { SqlDatabase } from '../../src/db/sqlDatabase';

export function createBetterSqliteAdapter(): SqlDatabase {
  const db = new Database(':memory:');
  return {
    async executeSql(sql: string, params: unknown[] = []) {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) {
        const rows = db.prepare(sql).all(...params);
        return { rows };
      }
      db.prepare(sql).run(...params);
      return { rows: [] };
    },
  };
}
```

```typescript
// src/db/activitiesRepository.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest activitiesRepository`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implement the interface, schema, adapters, and repository**

```typescript
// src/db/sqlDatabase.ts
export interface SqlDatabase {
  executeSql(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}
```

```typescript
// src/db/sqliteStorageAdapter.ts
import SQLite from 'react-native-sqlite-storage';
import { SqlDatabase } from './sqlDatabase';

SQLite.enablePromise(true);

export async function createSqliteStorageAdapter(): Promise<SqlDatabase> {
  const db = await SQLite.openDatabase({ name: 'traillog.db', location: 'default' });
  return {
    async executeSql(sql: string, params: unknown[] = []) {
      const [result] = await db.executeSql(sql, params);
      const rows: any[] = [];
      for (let i = 0; i < result.rows.length; i += 1) {
        rows.push(result.rows.item(i));
      }
      return { rows };
    },
  };
}
```

```typescript
// src/db/schema.ts
import { SqlDatabase } from './sqlDatabase';

export async function initSchema(db: SqlDatabase): Promise<void> {
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      updated_at TEXT NOT NULL
    )
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS route_points (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      sequence INTEGER NOT NULL
    )
  `);
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      captured_at TEXT NOT NULL,
      photo_path TEXT
    )
  `);
}
```

```typescript
// src/db/activitiesRepository.ts
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
  routePoints: Array<RoutePointInput & { id: string }>;
  checkpoints: Array<CheckpointInput & { id: string; photoPath: string | null }>;
}

export interface ActivitiesRepository {
  createActivity(input: { title: string; startedAt: string }): Promise<string>;
  addRoutePoint(activityId: string, point: RoutePointInput): Promise<string>;
  addCheckpoint(activityId: string, checkpoint: CheckpointInput): Promise<string>;
  setCheckpointPhotoPath(checkpointId: string, photoPath: string): Promise<void>;
  getActivity(activityId: string): Promise<Activity | null>;
  listActivities(): Promise<Activity[]>;
  updateActivityMetadata(activityId: string, changes: { title?: string; notes?: string }): Promise<void>;
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
      if (res.rows.length === 0) return null;
      return hydrate(res.rows[0]);
    },

    async listActivities() {
      const res = await db.executeSql('SELECT * FROM activities ORDER BY started_at DESC', []);
      return Promise.all(res.rows.map(hydrate));
    },

    async updateActivityMetadata(activityId, changes) {
      const now = new Date().toISOString();
      if (changes.title !== undefined) {
        await db.executeSql('UPDATE activities SET title = ?, updated_at = ? WHERE id = ?', [changes.title, now, activityId]);
      }
      if (changes.notes !== undefined) {
        await db.executeSql('UPDATE activities SET notes = ?, updated_at = ? WHERE id = ?', [changes.notes, now, activityId]);
      }
    },
  };
}
```

Add two runtime dependencies used above: `npm install react-native-sqlite-storage uuid react-native-get-random-values && npm install --save-dev @types/uuid @types/react-native-sqlite-storage`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest activitiesRepository`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/db test/support/betterSqliteAdapter.ts package.json
git commit -m "feat: add SQLite-backed activities repository, tested via a real-SQL test double"
```

---

### Task 3: PermissionsManager

**Files:**
- Create: `src/permissions/permissionsManager.ts`
- Test: `src/permissions/permissionsManager.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `requestLocationPermission()`, `requestCameraPermission()`, `requestMotionPermission()`, each resolving to `'granted' | 'denied' | 'restricted' | 'approximate-only'` — this normalized union is what Task 5 (LocationTrackingService) and Task 6 (camera capture) branch on.

- [ ] **Step 1: Write the failing test**

```typescript
// src/permissions/permissionsManager.test.ts
import { RESULTS } from 'react-native-permissions';
import { normalizeLocationResult } from './permissionsManager';

describe('normalizeLocationResult', () => {
  it('maps GRANTED fine location to granted', () => {
    expect(normalizeLocationResult(RESULTS.GRANTED, RESULTS.GRANTED)).toBe('granted');
  });

  it('maps coarse-only (fine denied, coarse granted) to approximate-only', () => {
    expect(normalizeLocationResult(RESULTS.DENIED, RESULTS.GRANTED)).toBe('approximate-only');
  });

  it('maps both denied to denied', () => {
    expect(normalizeLocationResult(RESULTS.DENIED, RESULTS.DENIED)).toBe('denied');
  });

  it('maps BLOCKED to restricted', () => {
    expect(normalizeLocationResult(RESULTS.BLOCKED, RESULTS.BLOCKED)).toBe('restricted');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest permissionsManager`
Expected: FAIL — `Cannot find module './permissionsManager'`.

- [ ] **Step 3: Implement it**

```typescript
// src/permissions/permissionsManager.ts
import { PERMISSIONS, RESULTS, check, request } from 'react-native-permissions';
import { Platform } from 'react-native';

export type NormalizedPermission = 'granted' | 'denied' | 'restricted' | 'approximate-only';

export function normalizeLocationResult(
  fineResult: (typeof RESULTS)[keyof typeof RESULTS],
  coarseResult: (typeof RESULTS)[keyof typeof RESULTS],
): NormalizedPermission {
  if (fineResult === RESULTS.GRANTED) return 'granted';
  if (fineResult === RESULTS.BLOCKED || coarseResult === RESULTS.BLOCKED) return 'restricted';
  if (coarseResult === RESULTS.GRANTED) return 'approximate-only';
  return 'denied';
}

export async function requestLocationPermission(): Promise<NormalizedPermission> {
  const finePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const coarsePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

  const fineResult = await request(finePermission);
  const coarseResult = Platform.OS === 'android' ? await request(coarsePermission) : fineResult;

  return normalizeLocationResult(fineResult, coarseResult);
}

export async function requestCameraPermission(): Promise<NormalizedPermission> {
  const permission = Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA;
  const result = await request(permission);
  if (result === RESULTS.GRANTED) return 'granted';
  if (result === RESULTS.BLOCKED) return 'restricted';
  return 'denied';
}

export async function requestMotionPermission(): Promise<NormalizedPermission> {
  if (Platform.OS !== 'ios') return 'granted'; // Android has no separate motion permission for step counting via accelerometer.
  const result = await request(PERMISSIONS.IOS.MOTION);
  if (result === RESULTS.GRANTED) return 'granted';
  if (result === RESULTS.BLOCKED) return 'restricted';
  return 'denied';
}

export async function checkLocationPermission(): Promise<NormalizedPermission> {
  const finePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const coarsePermission =
    Platform.OS === 'android' ? PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
  const fineResult = await check(finePermission);
  const coarseResult = Platform.OS === 'android' ? await check(coarsePermission) : fineResult;
  return normalizeLocationResult(fineResult, coarseResult);
}
```

Add the dependency: `npm install react-native-permissions`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest permissionsManager`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/permissions package.json
git commit -m "feat: add PermissionsManager normalizing platform permission states"
```

---

### Task 4: Step counting (accelerometer-based pedometer)

**Files:**
- Create: `src/sensors/stepDetector.ts`
- Create: `src/sensors/pedometerService.ts`
- Test: `src/sensors/stepDetector.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `detectSteps(samples: AccelerometerSample[]): number` (pure batch function, covered by this task's own tests) and `PedometerService.start(onStepCountChange)/stop()` — Task 6's tracking store consumes only the latter, treating it as an opaque service and never calling `detectSteps` directly.

- [ ] **Step 1: Write the failing test**

```typescript
// src/sensors/stepDetector.test.ts
import { detectSteps, AccelerometerSample } from './stepDetector';

function flatSamples(count: number): AccelerometerSample[] {
  return Array.from({ length: count }, (_, i) => ({ x: 0, y: 0, z: 9.8, timestamp: i * 20 }));
}

function walkingSamples(steps: number): AccelerometerSample[] {
  // One step ≈ one full sine-like oscillation in the vertical axis every ~500ms.
  const samples: AccelerometerSample[] = [];
  const samplesPerStep = 25; // 20ms interval × 25 = 500ms per step
  for (let i = 0; i < steps * samplesPerStep; i += 1) {
    const phase = (i % samplesPerStep) / samplesPerStep;
    const z = 9.8 + Math.sin(phase * 2 * Math.PI) * 4; // swings well above/below the 2.0 g-delta threshold
    samples.push({ x: 0, y: 0, z, timestamp: i * 20 });
  }
  return samples;
}

describe('detectSteps', () => {
  it('counts zero steps when the device is still', () => {
    expect(detectSteps(flatSamples(100))).toBe(0);
  });

  it('counts roughly one step per oscillation while walking', () => {
    const steps = detectSteps(walkingSamples(10));
    expect(steps).toBeGreaterThanOrEqual(8);
    expect(steps).toBeLessThanOrEqual(10);
  });

  it('ignores small jitter below the step threshold', () => {
    const jitter: AccelerometerSample[] = Array.from({ length: 100 }, (_, i) => ({
      x: 0,
      y: 0,
      z: 9.8 + Math.sin(i) * 0.3,
      timestamp: i * 20,
    }));
    expect(detectSteps(jitter)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest stepDetector`
Expected: FAIL — `Cannot find module './stepDetector'`.

- [ ] **Step 3: Implement peak detection**

```typescript
// src/sensors/stepDetector.ts
export interface AccelerometerSample {
  x: number;
  y: number;
  z: number;
  timestamp: number; // milliseconds
}

const GRAVITY = 9.8;
const PEAK_THRESHOLD = 2.0; // magnitude delta from gravity that counts as a step peak
const MIN_STEP_INTERVAL_MS = 250; // debounce: no human takes two steps faster than this

/**
 * Carries peak-detection state across calls so steps can be counted
 * incrementally, one sample at a time, without losing state at a
 * buffer/window boundary. `detectSteps` below uses a fresh accumulator
 * internally for one-shot batch counting; `PedometerService` (this file's
 * sibling) keeps one accumulator alive for an entire tracking session so
 * the count only ever goes up, instead of re-deriving a bounded count from
 * a sliding window on every sample.
 */
export class StepAccumulator {
  private lastPeakTimestamp = -Infinity;
  private wasAboveThreshold = false;
  private steps = 0;

  get stepCount(): number {
    return this.steps;
  }

  /** Returns true if this sample was just counted as a new step. */
  addSample(sample: AccelerometerSample): boolean {
    const magnitude = Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
    const delta = magnitude - GRAVITY;
    const isAboveThreshold = delta > PEAK_THRESHOLD;

    let countedStep = false;
    if (
      isAboveThreshold &&
      !this.wasAboveThreshold &&
      sample.timestamp - this.lastPeakTimestamp >= MIN_STEP_INTERVAL_MS
    ) {
      this.steps += 1;
      this.lastPeakTimestamp = sample.timestamp;
      countedStep = true;
    }
    this.wasAboveThreshold = isAboveThreshold;
    return countedStep;
  }
}

export function detectSteps(samples: AccelerometerSample[]): number {
  const accumulator = new StepAccumulator();
  for (const sample of samples) {
    accumulator.addSample(sample);
  }
  return accumulator.stepCount;
}
```

```typescript
// src/sensors/pedometerService.ts
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { Subscription } from 'rxjs';
import { StepAccumulator } from './stepDetector';

setUpdateIntervalForType(SensorTypes.accelerometer, 20);

export class PedometerService {
  private subscription: Subscription | null = null;
  private accumulator = new StepAccumulator();

  start(onStepCountChange: (count: number) => void): void {
    if (this.subscription) {
      return; // already running; avoid leaking a second subscription
    }
    this.accumulator = new StepAccumulator();
    this.subscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      const countedStep = this.accumulator.addSample({ x, y, z, timestamp });
      if (countedStep) {
        onStepCountChange(this.accumulator.stepCount);
      }
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
}
```

Add the dependency: `npm install react-native-sensors`.

**Design note (from Task 4's review):** an earlier version of `PedometerService` re-ran `detectSteps` over only the last 50 buffered samples (~1 second) on every new reading and treated that as the running total. Since old peaks age out of that window, the count would plateau or even decrease during a real walk instead of accumulating — it never worked as an actual pedometer. The `StepAccumulator` class above fixes this by carrying peak-detection state for the service's entire lifetime, incrementing a monotonic count on each genuinely new peak, and is also used inside `detectSteps` itself so the two never drift apart. This also removes the unbounded `buffer` array the old version grew forever, and guards `start()` against being called twice without an intervening `stop()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest stepDetector`
Expected: PASS — all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/sensors package.json
git commit -m "feat: add accelerometer-based step detector and pedometer service"
```

---

### Task 5: LocationTrackingService (background GPS route recording)

**Files:**
- Create: `src/tracking/trackingStateMachine.ts`
- Create: `src/tracking/locationTrackingService.ts`
- Modify: `android/app/src/main/AndroidManifest.xml` (foreground service + location permissions)
- Modify: `ios/TrailLogMobile/Info.plist` (background location mode)
- Test: `src/tracking/trackingStateMachine.test.ts`
- Test: `src/tracking/locationTrackingService.test.ts`

**Interfaces:**
- Consumes: `RoutePointInput` shape from Task 2's `activitiesRepository`.
- Produces: `TrackingStateMachine` (states `'idle' | 'recording' | 'paused' | 'stopped'`, method `transition(event)`) and `LocationTrackingService.start()/pause()/resume()/stop()`, emitting `RoutePointInput`-shaped objects via the constructor's `onRoutePoint` callback — this is what Task 6's Zustand store subscribes to. The constructor also takes an optional second `onError?: (error: unknown) => void` callback; Task 6 may pass one or omit it (both are valid — omitting it is exactly what the existing single-argument construction in Task 6's brief already does).

- [ ] **Step 1: Write the failing state machine test**

```typescript
// src/tracking/trackingStateMachine.test.ts
import { TrackingStateMachine } from './trackingStateMachine';

describe('TrackingStateMachine', () => {
  it('goes idle -> recording -> paused -> recording -> stopped', () => {
    const machine = new TrackingStateMachine();
    expect(machine.state).toBe('idle');

    machine.transition('START');
    expect(machine.state).toBe('recording');

    machine.transition('PAUSE');
    expect(machine.state).toBe('paused');

    machine.transition('RESUME');
    expect(machine.state).toBe('recording');

    machine.transition('STOP');
    expect(machine.state).toBe('stopped');
  });

  it('rejects PAUSE when idle', () => {
    const machine = new TrackingStateMachine();
    expect(() => machine.transition('PAUSE')).toThrow('Cannot PAUSE from idle');
  });

  it('rejects START when already recording', () => {
    const machine = new TrackingStateMachine();
    machine.transition('START');
    expect(() => machine.transition('START')).toThrow('Cannot START from recording');
  });

  it('rejects any transition once stopped', () => {
    const machine = new TrackingStateMachine();
    machine.transition('START');
    machine.transition('STOP');
    expect(() => machine.transition('RESUME')).toThrow('Cannot RESUME from stopped');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest trackingStateMachine`
Expected: FAIL — `Cannot find module './trackingStateMachine'`.

- [ ] **Step 3: Implement the state machine**

```typescript
// src/tracking/trackingStateMachine.ts
export type TrackingState = 'idle' | 'recording' | 'paused' | 'stopped';
export type TrackingEvent = 'START' | 'PAUSE' | 'RESUME' | 'STOP';

const ALLOWED_TRANSITIONS: Record<TrackingState, Partial<Record<TrackingEvent, TrackingState>>> = {
  idle: { START: 'recording' },
  recording: { PAUSE: 'paused', STOP: 'stopped' },
  paused: { RESUME: 'recording', STOP: 'stopped' },
  stopped: {},
};

export class TrackingStateMachine {
  private currentState: TrackingState = 'idle';

  get state(): TrackingState {
    return this.currentState;
  }

  transition(event: TrackingEvent): TrackingState {
    const nextState = ALLOWED_TRANSITIONS[this.currentState][event];
    if (!nextState) {
      throw new Error(`Cannot ${event} from ${this.currentState}`);
    }
    this.currentState = nextState;
    return nextState;
  }
}
```

- [ ] **Step 4: Run the state machine test to verify it passes**

Run: `npx jest trackingStateMachine`
Expected: PASS — all four cases green.

- [ ] **Step 5: Write the failing service test (formatting logic, native module mocked)**

```typescript
// src/tracking/locationTrackingService.test.ts
jest.mock('react-native-geolocation-service', () => ({
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
}));
jest.mock('react-native-background-actions', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
}));

import Geolocation from 'react-native-geolocation-service';
import { LocationTrackingService } from './locationTrackingService';

describe('LocationTrackingService', () => {
  it('formats a raw geolocation position into a RoutePointInput and assigns an incrementing sequence', () => {
    const onRoutePoint = jest.fn();
    const service = new LocationTrackingService(onRoutePoint);

    (Geolocation.watchPosition as jest.Mock).mockImplementation((success) => {
      success({
        coords: { latitude: 10.123, longitude: 106.456 },
        timestamp: 1_757_000_000_000,
      });
      return 1;
    });

    service.start();

    expect(onRoutePoint).toHaveBeenCalledWith({
      lat: 10.123,
      lng: 106.456,
      recordedAt: new Date(1_757_000_000_000).toISOString(),
      sequence: 0,
    });
  });

  it('increments sequence across multiple points and rejects a second start while recording', () => {
    const onRoutePoint = jest.fn();
    const service = new LocationTrackingService(onRoutePoint);
    let capturedSuccess: (position: any) => void = () => {};

    (Geolocation.watchPosition as jest.Mock).mockImplementation((success) => {
      capturedSuccess = success;
      return 1;
    });

    service.start();
    capturedSuccess({ coords: { latitude: 1, longitude: 1 }, timestamp: 1000 });
    capturedSuccess({ coords: { latitude: 2, longitude: 2 }, timestamp: 2000 });

    expect(onRoutePoint).toHaveBeenNthCalledWith(1, expect.objectContaining({ sequence: 0 }));
    expect(onRoutePoint).toHaveBeenNthCalledWith(2, expect.objectContaining({ sequence: 1 }));
    expect(() => service.start()).toThrow('Cannot START from recording');
  });

  describe('on Android', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('starts watching synchronously (before any background task callback can fire) and clears it on pause', () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));
      jest.doMock('react-native-background-actions', () => ({
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const Geo = require('react-native-geolocation-service');
      const AndroidBackgroundActions = require('react-native-background-actions');
      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');

      const service = new AndroidLocationTrackingService(jest.fn());
      service.start();

      // watchId must already be set — this is the exact race the review caught:
      // watchPosition used to only run once BackgroundActions' task callback
      // fired on a later tick, so pause() could miss clearWatch entirely.
      expect(Geo.watchPosition).toHaveBeenCalledTimes(1);
      expect(AndroidBackgroundActions.start).toHaveBeenCalledTimes(1);

      service.pause();
      expect(Geo.clearWatch).toHaveBeenCalledWith(1);
    });

    it('keeps the background task promise pending until stop() releases it', async () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));

      let capturedTask: (() => Promise<void>) | null = null;
      jest.doMock('react-native-background-actions', () => ({
        start: jest.fn().mockImplementation((task: () => Promise<void>) => {
          capturedTask = task;
          return task();
        }),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');
      const service = new AndroidLocationTrackingService(jest.fn());
      service.start();

      let resolved = false;
      capturedTask!().then(() => {
        resolved = true;
      });
      await Promise.resolve();
      // This is the exact bug the review caught: the old code's task
      // resolved on its own immediately, which the library reads as "done"
      // and tears the foreground service down right away.
      expect(resolved).toBe(false);

      service.stop();
      await Promise.resolve();
      expect(resolved).toBe(true);
    });

    it('does not get stuck if pause()/resume() happen before the native side ever invokes the task callback', async () => {
      jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
        OS: 'android',
        select: (obj: any) => obj.android,
      }));
      jest.doMock('react-native-geolocation-service', () => ({
        watchPosition: jest.fn().mockReturnValue(1),
        clearWatch: jest.fn(),
      }));

      const capturedTasks: Array<() => Promise<void>> = [];
      jest.doMock('react-native-background-actions', () => ({
        // Simulate real Android timing: start()'s own promise resolves
        // right away, but the task it registers is only invoked later,
        // by the native side — not synchronously here.
        start: jest.fn().mockImplementation((task: () => Promise<void>) => {
          capturedTasks.push(task);
          return Promise.resolve();
        }),
        stop: jest.fn().mockResolvedValue(undefined),
      }));

      const AndroidBackgroundActions = require('react-native-background-actions');
      const { LocationTrackingService: AndroidLocationTrackingService } = require('./locationTrackingService');
      const service = new AndroidLocationTrackingService(jest.fn());

      service.start(); // registers task #1; native hasn't invoked it yet
      service.pause(); // pauses before native ever gets to it
      service.resume(); // must register a fresh task, not be blocked by a stale guard

      expect(AndroidBackgroundActions.start).toHaveBeenCalledTimes(2);

      // Now let the native side finally get around to invoking the first
      // (stale) task — it must resolve on its own instead of hanging.
      let firstTaskResolved = false;
      capturedTasks[0]().then(() => {
        firstTaskResolved = true;
      });
      await Promise.resolve();
      expect(firstTaskResolved).toBe(true);
    });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest locationTrackingService`
Expected: FAIL — `Cannot find module './locationTrackingService'`.

- [ ] **Step 7: Implement the service**

```typescript
// src/tracking/locationTrackingService.ts
import Geolocation from 'react-native-geolocation-service';
import BackgroundActions from 'react-native-background-actions';
import { Platform } from 'react-native';
import { RoutePointInput } from '../db/activitiesRepository';
import { TrackingStateMachine } from './trackingStateMachine';

const BACKGROUND_TASK_OPTIONS = {
  taskName: 'TrailLog',
  taskTitle: 'Recording your route',
  taskDesc: 'TrailLog is tracking your location in the background',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  parameters: {},
};

export class LocationTrackingService {
  private readonly stateMachine = new TrackingStateMachine();
  private watchId: number | null = null;
  private sequence = 0;
  private backgroundKeepAliveActive = false;
  private backgroundKeepAliveGeneration = 0;
  private releaseBackgroundTask: (() => void) | null = null;

  constructor(
    private readonly onRoutePoint: (point: RoutePointInput) => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  private reportError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
    } else {
      console.warn('[LocationTrackingService]', error);
    }
  }

  get state() {
    return this.stateMachine.state;
  }

  start(): void {
    this.stateMachine.transition('START');
    this.sequence = 0;
    this.beginWatching();
  }

  pause(): void {
    this.stateMachine.transition('PAUSE');
    this.stopWatching();
    this.stopBackgroundKeepAlive();
  }

  resume(): void {
    this.stateMachine.transition('RESUME');
    this.beginWatching();
  }

  stop(): void {
    this.stateMachine.transition('STOP');
    this.stopWatching();
    this.stopBackgroundKeepAlive();
  }

  private beginWatching(): void {
    // watchPosition is called synchronously, right here, so watchId is
    // always set before this method returns — pause()/stop() can never
    // race a late-firing background task callback (see the design note
    // below this class).
    this.watchId = Geolocation.watchPosition(
      (position) => {
        this.onRoutePoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt: new Date(position.timestamp).toISOString(),
          sequence: this.sequence,
        });
        this.sequence += 1;
      },
      (error) => {
        this.reportError(error);
      },
      { enableHighAccuracy: true, distanceFilter: 5, interval: 5000 },
    );

    if (Platform.OS === 'android') {
      this.startBackgroundKeepAlive();
    }
    // iOS: relies on UIBackgroundModes: ["location"] in Info.plist; no
    // separate keep-alive task exists or is needed there.
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private startBackgroundKeepAlive(): void {
    if (this.backgroundKeepAliveActive) {
      return; // already running — set synchronously below, so this can
      // never be fooled by how late the native side gets around to
      // actually invoking the task callback (see the design note).
    }
    this.backgroundKeepAliveActive = true;
    this.backgroundKeepAliveGeneration += 1;
    const generation = this.backgroundKeepAliveGeneration;

    // BackgroundActions treats a resolved task promise as "the task is
    // done" and immediately tears the foreground service down — so this
    // promise must stay pending until stopBackgroundKeepAlive() releases
    // it, never resolve on its own. Exception: if a pause()+resume() cycle
    // already happened by the time the native side finally invokes this
    // callback, `generation` will no longer match — this specific task is
    // stale (superseded by a newer one), so resolve it immediately instead
    // of parking a resolver nothing will ever call. Checking
    // `backgroundKeepAliveActive` alone isn't enough here: after a
    // pause()+resume(), that flag is true again (set by the new call), so
    // a stale task's callback would wrongly think it's still current.
    BackgroundActions.start(
      () =>
        new Promise<void>((resolve) => {
          if (!this.backgroundKeepAliveActive || generation !== this.backgroundKeepAliveGeneration) {
            resolve();
            return;
          }
          this.releaseBackgroundTask = resolve;
        }),
      BACKGROUND_TASK_OPTIONS,
    ).catch((error: unknown) => {
      this.reportError(error);
    });
  }

  private stopBackgroundKeepAlive(): void {
    if (Platform.OS !== 'android') {
      return;
    }
    this.backgroundKeepAliveActive = false;
    this.releaseBackgroundTask?.();
    this.releaseBackgroundTask = null;
    BackgroundActions.stop().catch((error: unknown) => {
      this.reportError(error);
    });
  }
}
```

Add the dependency: `npm install react-native-geolocation-service react-native-background-actions`.

**Design note (from Task 5's review):** an earlier version of this class started `Geolocation.watchPosition` *inside* the callback passed to `BackgroundActions.start(async () => watch(), ...)`. Two problems followed from that. First, `async () => watch()` resolves on the very next tick (`watch()` is synchronous), and the `react-native-background-actions` library treats a resolved task as "finished" — it immediately tore the foreground service down again, so background tracking never actually survived the app being backgrounded on Android. Second, because the real library only invokes that callback once the native side has actually started the foreground service (a later tick, not synchronous with `start()` returning), `watchId` could still be `null` when `pause()`/`stop()` ran right after `start()`, silently skipping `clearWatch` and leaking a live GPS subscription that kept feeding route points after the service reported itself paused or stopped.

The fix above separates the two jobs the old code conflated: `watchPosition` is now called synchronously in `beginWatching()` itself, independent of any background-task machinery, so `watchId` is always set before `start()`/`resume()` return. `BackgroundActions.start()` is now used purely to hold a promise open (via `startBackgroundKeepAlive()`/`stopBackgroundKeepAlive()`) so Android doesn't suspend the process while backgrounded — it never gates whether GPS watching happens. `pause()` now also releases that keep-alive task (mirroring `stop()`), and `resume()` restarts it via `beginWatching()`. An `onError` callback was added to the constructor so geolocation and background-service failures are actually observable instead of being silently swallowed, and the two `BackgroundActions` calls are `.catch()`-handled so a native failure becomes a callback invocation, not an unhandled promise rejection.

**Second design note (from re-review after the first fix):** the first fix above still had one hole: `startBackgroundKeepAlive()`'s "already running" guard originally checked `releaseBackgroundTask`, which the real library only assigns once the native side actually invokes the task callback — a later, unpredictable tick, not synchronous with `BackgroundActions.start()` being called. A quick `pause()` immediately followed by `resume()` could run entirely before that native callback ever fired; when it finally did fire (against the now-resumed service), it would assign `releaseBackgroundTask` on a session `resume()` had already moved past, and the *next* `startBackgroundKeepAlive()` call would see that stale non-null value and silently skip starting a new native task — permanently losing the foreground service for the rest of that run, with no error and no visible symptom until Android killed the backgrounded app.

**Third design note (a plain boolean guard turned out not to be enough — caught by actually running this task's own test):** the first pass at fixing the above replaced the guard with a plain `backgroundKeepAliveActive` boolean, set synchronously the instant `startBackgroundKeepAlive()` runs. That is *not* sufficient on its own, and the class above reflects the corrected version, not that intermediate one: after a `pause()` immediately followed by `resume()`, `backgroundKeepAliveActive` is back to `true` (set by `resume()`'s own call) by the time the stale first task's callback finally fires — so checking only that flag makes the stale task wrongly conclude it's still the current one, and it parks its resolver instead of self-resolving, reproducing the same class of bug one level down. The class above adds `backgroundKeepAliveGeneration`, a counter incremented each time `startBackgroundKeepAlive()` runs; each task callback closes over the generation number that was current when *it* was created, and checks that number against the current one (not just the boolean) before deciding whether it's stale. This was caught only because the fixing engineer ran the test the previous design note specified against the previous note's own proposed code, rather than trusting the prose — a reminder that a design note in this document is a claim, not a proof, until its test actually passes.

Add to `android/app/src/main/AndroidManifest.xml`, inside `<manifest>` and `<application>` respectively:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

```xml
<service android:name="com.asterinet.react.bgactions.RNBackgroundActionsTask" android:foregroundServiceType="location" />
```

Add to `ios/TrailLogMobile/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
<key>NSLocationWhenInUseUsageDescription</key>
<string>TrailLog needs your location to record your route.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>TrailLog needs your location to keep recording your route while your screen is off.</string>
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest locationTrackingService`
Expected: PASS — both cases green.

- [ ] **Step 9: Commit**

```bash
git add src/tracking android/app/src/main/AndroidManifest.xml ios/TrailLogMobile/Info.plist package.json
git commit -m "feat: add background-capable LocationTrackingService with a pure state machine"
```

---

### Task 6: Tracking screen (Zustand store + camera checkpoints + live map)

**Files:**
- Create: `src/store/trackingStore.ts`
- Create: `src/camera/cameraService.ts`
- Create: `src/screens/TrackingScreen.tsx`
- Modify: `App.tsx` (add `Tracking` route)
- Test: `src/store/trackingStore.test.ts`
- Test: `src/screens/TrackingScreen.test.tsx`

**Interfaces:**
- Consumes: `ActivitiesRepository` (Task 2), `LocationTrackingService` (Task 5), `PedometerService` (Task 4), `requestLocationPermission`/`requestCameraPermission` (Task 3).
- Produces: `useTrackingStore` — `status`, `distanceMeters`, `stepCount`, `checkpointCount`, actions `startActivity()/pauseActivity()/resumeActivity()/stopActivity()/captureCheckpoint()` — the shape screens in Task 7 also read from for the just-finished activity's id.

- [ ] **Step 1: Write the failing store test**

```typescript
// src/store/trackingStore.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest trackingStore`
Expected: FAIL — `Cannot find module './trackingStore'`.

- [ ] **Step 3: Implement the store**

```typescript
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
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `npx jest trackingStore`
Expected: PASS — both cases green.

- [ ] **Step 5: Write the failing screen component test**

```tsx
// src/screens/TrackingScreen.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TrackingScreen } from './TrackingScreen';
import { useTrackingStore } from '../store/trackingStore';

jest.mock('../store/trackingStore');

describe('TrackingScreen', () => {
  it('shows an idle Start button and calls startActivity when pressed', () => {
    const startActivity = jest.fn();
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'idle',
      stepCount: 0,
      checkpointCount: 0,
      startActivity,
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
    });

    render(<TrackingScreen />);
    fireEvent.press(screen.getByText('Start'));
    expect(startActivity).toHaveBeenCalled();
  });

  it('shows live step count while recording', () => {
    (useTrackingStore as unknown as jest.Mock).mockReturnValue({
      status: 'recording',
      stepCount: 42,
      checkpointCount: 1,
      startActivity: jest.fn(),
      pauseActivity: jest.fn(),
      resumeActivity: jest.fn(),
      stopActivity: jest.fn(),
    });

    render(<TrackingScreen />);
    expect(screen.getByText('Steps: 42')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest TrackingScreen`
Expected: FAIL — `Cannot find module './TrackingScreen'`.

- [ ] **Step 7: Implement the screen**

```tsx
// src/screens/TrackingScreen.tsx
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useTrackingStore } from '../store/trackingStore';

export function TrackingScreen() {
  const { status, stepCount, checkpointCount, startActivity, pauseActivity, resumeActivity, stopActivity } =
    useTrackingStore();

  return (
    <View style={styles.container}>
      <Text style={styles.stat}>Steps: {stepCount}</Text>
      <Text style={styles.stat}>Checkpoints: {checkpointCount}</Text>

      {status === 'idle' && <Button title="Start" onPress={startActivity} />}
      {status === 'recording' && (
        <>
          <Button title="Pause" onPress={pauseActivity} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}
      {status === 'paused' && (
        <>
          <Button title="Resume" onPress={resumeActivity} />
          <Button title="Stop" onPress={stopActivity} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stat: { fontSize: 18 },
});
```

```typescript
// src/camera/cameraService.ts
import { Camera } from 'react-native-vision-camera';

export interface CapturedPhoto {
  path: string;
}

export async function capturePhoto(camera: Camera): Promise<CapturedPhoto> {
  const photo = await camera.takePhoto({ flash: 'off' });
  return { path: photo.path };
}
```

```tsx
// App.tsx (add the Tracking route)
import { TrackingScreen } from './src/screens/TrackingScreen';
// ...inside Stack.Navigator, after the Home screen:
        <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Track activity' }} />
```

Add the dependency: `npm install react-native-vision-camera react-native-maps`.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest TrackingScreen`
Expected: PASS — both cases green.

- [ ] **Step 9: Commit**

```bash
git add src/store src/camera src/screens/TrackingScreen.tsx App.tsx package.json
git commit -m "feat: add tracking screen wiring location, pedometer, and local storage together"
```

---

### Task 7: History and activity summary screens

**Files:**
- Create: `src/screens/HistoryScreen.tsx`
- Create: `src/screens/ActivitySummaryScreen.tsx`
- Modify: `App.tsx` (add `History` and `ActivitySummary` routes)
- Test: `src/screens/HistoryScreen.test.tsx`
- Test: `src/screens/ActivitySummaryScreen.test.tsx`

**Interfaces:**
- Consumes: `ActivitiesRepository.listActivities()/getActivity()` from Task 2.
- Produces: nothing new consumed elsewhere in this plan — these are leaf screens.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/screens/HistoryScreen.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { HistoryScreen } from './HistoryScreen';
import * as repoModule from '../db/activitiesRepository';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));

describe('HistoryScreen', () => {
  it('renders each activity title from the repository', async () => {
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      listActivities: jest.fn().mockResolvedValue([
        { id: '1', title: 'Morning hike', startedAt: '2026-09-06T07:00:00.000Z', routePoints: [], checkpoints: [] },
        { id: '2', title: 'Evening walk', startedAt: '2026-09-05T18:00:00.000Z', routePoints: [], checkpoints: [] },
      ]),
    } as any);

    render(<HistoryScreen />);

    await waitFor(() => expect(screen.getByText('Morning hike')).toBeTruthy());
    expect(screen.getByText('Evening walk')).toBeTruthy();
  });
});
```

```tsx
// src/screens/ActivitySummaryScreen.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ActivitySummaryScreen } from './ActivitySummaryScreen';
import * as repoModule from '../db/activitiesRepository';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));

describe('ActivitySummaryScreen', () => {
  it('shows the route point count and checkpoint count for the given activity', async () => {
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue({
        id: '1',
        title: 'Morning hike',
        startedAt: '2026-09-06T07:00:00.000Z',
        routePoints: [{}, {}, {}],
        checkpoints: [{}],
      }),
    } as any);

    render(<ActivitySummaryScreen route={{ params: { activityId: '1' } } as any} />);

    await waitFor(() => expect(screen.getByText('Morning hike')).toBeTruthy());
    expect(screen.getByText('3 route points')).toBeTruthy();
    expect(screen.getByText('1 checkpoint')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest HistoryScreen ActivitySummaryScreen`
Expected: FAIL — both modules don't exist yet.

- [ ] **Step 3: Implement the screens**

```tsx
// src/screens/HistoryScreen.tsx
import React, { useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';

export function HistoryScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const navigation = useNavigation<any>();

  useEffect(() => {
    (async () => {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      setActivities(await repo.listActivities());
    })();
  }, []);

  return (
    <FlatList
      data={activities}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity onPress={() => navigation.navigate('ActivitySummary', { activityId: item.id })}>
          <View>
            <Text>{item.title}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}
```

```tsx
// src/screens/ActivitySummaryScreen.tsx
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';

interface Props {
  route: { params: { activityId: string } };
}

export function ActivitySummaryScreen({ route }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    (async () => {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      setActivity(await repo.getActivity(route.params.activityId));
    })();
  }, [route.params.activityId]);

  if (!activity) return null;

  return (
    <View>
      <Text>{activity.title}</Text>
      <Text>{activity.routePoints.length} route points</Text>
      <Text>{activity.checkpoints.length} checkpoint{activity.checkpoints.length === 1 ? '' : 's'}</Text>
    </View>
  );
}
```

```tsx
// App.tsx (add both routes)
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ActivitySummaryScreen } from './src/screens/ActivitySummaryScreen';
// ...inside Stack.Navigator, after Tracking:
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
        <Stack.Screen name="ActivitySummary" component={ActivitySummaryScreen} options={{ title: 'Summary' }} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest HistoryScreen ActivitySummaryScreen`
Expected: PASS — both suites green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/HistoryScreen.tsx src/screens/ActivitySummaryScreen.tsx App.tsx
git commit -m "feat: add history list and activity summary screens"
```

---

### Task 8: End-to-end test for the background-tracking path (Detox)

**Files:**
- Create: `.detoxrc.js`
- Create: `e2e/jest.config.js`
- Create: `e2e/trackingFlow.test.ts`
- Modify: `.github/workflows/mobile-ci.yml` (add a separate, non-blocking `e2e` job)

**Interfaces:**
- Consumes: the `Start`/`Pause`/`Stop` button labels from Task 6's `TrackingScreen` and the `3 route points`-style summary text from Task 7's `ActivitySummaryScreen`.
- Produces: nothing — this is the final task in this plan.

- [ ] **Step 1: Write the Detox config**

```javascript
// .detoxrc.js
module.exports = {
  testRunner: {
    args: { config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: { avdName: 'Pixel_6_API_34' },
    },
  },
  configurations: {
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
```

```javascript
// e2e/jest.config.js
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  testTimeout: 180000,
  maxWorkers: 1,
};
```

- [ ] **Step 2: Write the E2E test**

```typescript
// e2e/trackingFlow.test.ts
import { by, device, element, expect as detoxExpect } from 'detox';

describe('Background tracking flow', () => {
  beforeAll(async () => {
    await device.launchApp({ permissions: { location: 'always', camera: 'YES', motion: 'YES' } });
  });

  it('records a route across a background/foreground cycle', async () => {
    await element(by.text('Track')).tap();
    await element(by.text('Start')).tap();

    // Feed synthetic GPS points while the app is backgrounded.
    await device.setLocation(10.1, 106.1);
    await device.sendToHome();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await device.setLocation(10.2, 106.2);
    await device.launchApp({ newInstance: false });

    await element(by.text('Stop')).tap();

    await detoxExpect(element(by.text(/\d+ route points/))).toBeVisible();
  });
});
```

Note: this test requires a real emulator with `adb emu geo fix` support (`device.setLocation` uses it under the hood) and is not runnable in the same CI job as the unit tests — see the workflow change below.

- [ ] **Step 3: Add a separate, manually-triggered CI job**

```yaml
# .github/workflows/mobile-ci.yml (add this job; keep the existing `test` job as-is)
  e2e:
    if: github.event_name == 'workflow_dispatch'
    runs-on: macos-14 # includes the Android emulator/KVM support needed for Detox
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx detox build --configuration android.emu.debug
      - run: npx detox test --configuration android.emu.debug
```

Also add `on: workflow_dispatch:` alongside the existing `push`/`pull_request` triggers at the top of the file so this job can be run on demand instead of on every push, matching the spec's "E2E runs separately given emulator cost."

- [ ] **Step 4: Verify manually**

Run: `npx detox build --configuration android.emu.debug && npx detox test --configuration android.emu.debug`
Expected: the emulator boots, the app installs, and the test reports 1 passing spec.

- [ ] **Step 5: Commit**

```bash
git add .detoxrc.js e2e .github/workflows/mobile-ci.yml
git commit -m "test: add Detox e2e coverage for the background tracking flow"
```

---

## Self-Review Notes

- **Spec coverage:** real-time GPS recording incl. background ✅ (Task 5, verified end-to-end in Task 8), photo checkpoints ✅ (Task 6), step counting ✅ (Task 4), fully offline operation ✅ (no network calls anywhere in this plan — verified by construction, not just by test), CI ✅ (Task 1, extended in Task 8). Cross-device sync and auth are explicitly out of scope here — deferred to the follow-up Mobile Auth & Sync plan once this plan's repository and service interfaces are locked in by actual implementation.
- **Placeholder scan:** none found. The `resume()`/`start()` bug caught and corrected inline in Task 5 is left visible (with the wrong version struck through by the corrected block that follows it) so the implementer sees why the split exists, rather than silently presenting only the fixed version.
- **Type consistency:** `RoutePointInput` (Task 2) is the exact type `LocationTrackingService.onRoutePoint` (Task 5) emits and `trackingStore` (Task 6) passes to `repo.addRoutePoint` — checked field-by-field (`lat`, `lng`, `recordedAt`, `sequence`). `ActivitiesRepository`'s method names (`createActivity`, `addRoutePoint`, `addCheckpoint`, `getActivity`, `listActivities`, `updateActivityMetadata`) are used identically in Tasks 6 and 7 with no renaming.
