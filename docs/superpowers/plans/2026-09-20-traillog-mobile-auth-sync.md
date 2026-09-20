# TrailLog Mobile — Auth & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the already-built TrailLog mobile app (offline GPS tracking, camera checkpoints, local SQLite storage) to the already-built TrailLog backend (NestJS + Postgres, JWT auth, activities CRUD, conflict detection, checkpoint photo storage) — login/register, a background sync queue that pushes finished activities and their checkpoint photos, and last-write-wins conflict resolution surfaced to the user.

**Architecture:** A thin typed `ApiClient` wraps every backend endpoint and attaches the stored JWT. A `SyncEngine` reads locally-pending activities from the existing `ActivitiesRepository`, pushes each one (metadata + route points in one call, since the backend's create endpoint already accepts nested route points — checkpoints and their photos are separate calls per the backend's actual shape), retries with backoff on failure, and surfaces a conflict (never silently overwrites) when the backend reports one. Sync is triggered manually from the UI in this plan — no background/automatic trigger — to keep scope bounded; that's a deliberate simplification, not an oversight.

**Tech Stack:** Same as the mobile-core plan (React Native bare workflow, TypeScript strict, Zustand, Jest + `@testing-library/react-native`) plus `@react-native-async-storage/async-storage` for token persistence — no new native camera/location/sensor dependencies.

## Global Constraints

- **This plan builds on the real, already-shipped interfaces — not the ones originally imagined in the design spec.** Two corrections from the backend's final review apply here: `PATCH /activities/:id` returns **`200`** with `{ conflict: true, serverActivity }` on a conflict, never a `409` status — branch on the response body shape, not the HTTP status code. Auth issues a single access token with **no refresh flow** — there is no refresh endpoint to call.
- **The backend never accepts a client-supplied id.** `POST /activities` and `POST /activities/:id/checkpoints` always return a server-generated UUID different from the local SQLite row's `id`. The local schema needs a `server_id` column to remember the mapping — added in Task 2, a backward-compatible `ALTER TABLE`, not a rewrite of Task 2's original schema.
- **Route points are synced embedded in the activity, not separately.** The backend's `POST /activities` DTO already accepts a nested `routePoints` array; there is no separate route-point-sync endpoint. Sync therefore happens once per finished activity (title/notes/start/end + all its route points in one call), then checkpoints and their photos as follow-up calls — this is a deliberate refinement of the original design spec's "route data synced independently from photos" phrasing, made to match what the backend actually implements, not a scope cut.
- **Token storage uses `@react-native-async-storage/async-storage`, not a keychain-backed secure store.** This is a deliberate, disclosed simplification for this project's scope (matching the backend's own accepted "no refresh tokens / placeholder JWT secret" simplifications) — a production hardening pass would move this to `react-native-keychain`.
- No new native permissions/manifest entries are needed — this plan is pure networking + local DB + UI, no new hardware access.
- React Native bare workflow (already scaffolded), TypeScript strict mode.
- `SyncEngine` gets dedicated, thorough unit tests using a fake `ApiClient` and a fake/injectable clock for backoff timing — this is the most important logic in this plan, per the original design spec's testing strategy.

---

### Task 1: Typed API client + token storage

**Files:**
- Create: `src/api/tokenStorage.ts`
- Create: `src/api/apiClient.ts`
- Test: `src/api/apiClient.test.ts`

**Interfaces:**
- Consumes: nothing new (talks to the backend over `fetch`, no local repository access).
- Produces: `TokenStorage` (`getToken()/setToken(token)/clearToken()`, backed by AsyncStorage) and `createApiClient(baseUrl)` returning `{ register, login, listActivities, createActivity, updateActivityMetadata, createCheckpoint, uploadCheckpointPhoto }` — every later task depends on this exact shape. Each method throws a typed `ApiError` (with `status` and, for a conflict response, `serverActivity`) on a non-2xx or network failure, so `SyncEngine` (Task 4) can branch on it without re-parsing raw `fetch` responses.

- [ ] **Step 1: Write the failing test**

```typescript
// src/api/apiClient.test.ts
import { createApiClient, ApiError } from './apiClient';

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('createApiClient', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('register() posts credentials and returns an access token', async () => {
    mockFetchOnce(201, { accessToken: 'tok-123' });
    const client = createApiClient('https://api.example.com', async () => null);

    const result = await client.register('a@example.com', 'password123');

    expect(result).toEqual({ accessToken: 'tok-123' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@example.com', password: 'password123' }),
      }),
    );
  });

  it('attaches a bearer token from the token provider on authenticated calls', async () => {
    mockFetchOnce(200, []);
    const client = createApiClient('https://api.example.com', async () => 'stored-token');

    await client.listActivities();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer stored-token');
  });

  it('createActivity() sends nested route points and returns the server-assigned id', async () => {
    mockFetchOnce(201, { id: 'server-id-1', title: 'Hike', updatedAt: '2026-09-21T00:00:00.000Z' });
    const client = createApiClient('https://api.example.com', async () => 'tok');

    const result = await client.createActivity({
      title: 'Hike',
      startedAt: '2026-09-21T00:00:00.000Z',
      endedAt: '2026-09-21T01:00:00.000Z',
      routePoints: [{ lat: 10.1, lng: 106.1, recordedAt: '2026-09-21T00:00:00.000Z', sequence: 0 }],
    });

    expect(result).toEqual({ id: 'server-id-1', title: 'Hike', updatedAt: '2026-09-21T00:00:00.000Z' });
  });

  it('updateActivityMetadata() surfaces a conflict body without throwing', async () => {
    mockFetchOnce(200, { conflict: true, serverActivity: { id: 's1', title: 'Server title', updatedAt: '2026-09-21T02:00:00.000Z' } });
    const client = createApiClient('https://api.example.com', async () => 'tok');

    const result = await client.updateActivityMetadata('s1', { title: 'My title', clientUpdatedAt: '2026-09-21T00:00:00.000Z' });

    expect(result).toEqual({
      conflict: true,
      serverActivity: { id: 's1', title: 'Server title', updatedAt: '2026-09-21T02:00:00.000Z' },
    });
  });

  it('throws a typed ApiError on a non-2xx, non-conflict response', async () => {
    mockFetchOnce(401, { message: 'Invalid email or password' });
    const client = createApiClient('https://api.example.com', async () => null);

    await expect(client.login('a@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });

  it('throws a typed ApiError with no status on a network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    const client = createApiClient('https://api.example.com', async () => null);

    await expect(client.listActivities()).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest apiClient`
Expected: FAIL — `Cannot find module './apiClient'`.

- [ ] **Step 3: Implement token storage and the API client**

```typescript
// src/api/tokenStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'traillog.accessToken';

export const tokenStorage = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(TOKEN_KEY);
  },
  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  },
  async clearToken(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_KEY);
  },
};
```

```typescript
// src/api/apiClient.ts
export class ApiError extends Error {
  status?: number;
  serverActivity?: unknown;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface ServerActivity {
  id: string;
  title: string;
  notes?: string | null;
  visibility?: string;
  updatedAt: string;
}

export interface CreateActivityPayload {
  title: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  routePoints: Array<{ lat: number; lng: number; recordedAt: string; sequence: number }>;
}

export type UpdateActivityResult =
  | ServerActivity
  | { conflict: true; serverActivity: ServerActivity };

export interface ApiClient {
  register(email: string, password: string): Promise<{ accessToken: string }>;
  login(email: string, password: string): Promise<{ accessToken: string }>;
  listActivities(): Promise<ServerActivity[]>;
  createActivity(payload: CreateActivityPayload): Promise<ServerActivity>;
  updateActivityMetadata(
    serverActivityId: string,
    dto: { title?: string; notes?: string; visibility?: string; clientUpdatedAt: string },
  ): Promise<UpdateActivityResult>;
  createCheckpoint(
    serverActivityId: string,
    dto: { lat: number; lng: number; capturedAt: string },
  ): Promise<{ id: string }>;
  uploadCheckpointPhoto(
    serverActivityId: string,
    serverCheckpointId: string,
    photo: { uri: string; name: string; type: string },
  ): Promise<{ photoUrl: string }>;
}

type TokenProvider = () => Promise<string | null>;

export function createApiClient(baseUrl: string, getToken: TokenProvider): ApiClient {
  async function request<T>(
    path: string,
    init: { method: string; body?: unknown; isMultipart?: boolean; authenticated?: boolean } = { method: 'GET' },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (!init.isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    if (init.authenticated !== false) {
      const token = await getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    let response: { ok: boolean; status: number; json: () => Promise<any> };
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.isMultipart ? (init.body as any) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : 'Network request failed');
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(body?.message ?? `Request failed with status ${response.status}`, response.status);
    }

    return body as T;
  }

  return {
    register(email, password) {
      return request('/auth/register', { method: 'POST', body: { email, password }, authenticated: false });
    },

    login(email, password) {
      return request('/auth/login', { method: 'POST', body: { email, password }, authenticated: false });
    },

    listActivities() {
      return request('/activities', { method: 'GET' });
    },

    createActivity(payload) {
      return request('/activities', { method: 'POST', body: payload });
    },

    updateActivityMetadata(serverActivityId, dto) {
      return request(`/activities/${serverActivityId}`, { method: 'PATCH', body: dto });
    },

    createCheckpoint(serverActivityId, dto) {
      return request(`/activities/${serverActivityId}/checkpoints`, { method: 'POST', body: dto });
    },

    async uploadCheckpointPhoto(serverActivityId, serverCheckpointId, photo) {
      const form = new FormData();
      form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type } as any);
      return request(`/activities/${serverActivityId}/checkpoints/${serverCheckpointId}/photo`, {
        method: 'POST',
        body: form,
        isMultipart: true,
      });
    },
  };
}
```

Add the dependency: `npm install @react-native-async-storage/async-storage`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest apiClient`
Expected: PASS — all six cases green.

- [ ] **Step 5: Commit**

```bash
git add src/api package.json
git commit -m "feat: add typed API client and token storage for the backend"
```

---

### Task 2: Local schema migration for server IDs and sync status

**Files:**
- Modify: `src/db/schema.ts` (add `server_id` columns, a `checkpoints.sync_status` column)
- Modify: `src/db/activitiesRepository.ts` (add sync-related methods)
- Test: extend `src/db/activitiesRepository.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase`, the existing `Activity`/`RoutePoint`/`Checkpoint` shapes (Task 2 of the mobile-core plan).
- Produces: `ActivitiesRepository.listPendingActivities(): Promise<Activity[]>`, `markActivitySynced(localId, serverId, serverUpdatedAt): Promise<void>`, `markActivityConflict(localId, serverActivitySnapshot: string): Promise<void>`, `markCheckpointSynced(localCheckpointId, serverCheckpointId): Promise<void>`, `markCheckpointPhotoUploaded(localCheckpointId): Promise<void>` — Task 4's `SyncEngine` calls all of these. `Activity`'s type grows two new optional fields: `serverId: string | null` and `conflictServerActivity: string | null` (a JSON-encoded snapshot); `Checkpoint`'s type (nested in `Activity`) grows `serverId: string | null` and `photoUploaded: boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/db/activitiesRepository.test.ts (append to the existing describe block)
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest activitiesRepository`
Expected: FAIL — `repo.listPendingActivities is not a function`.

- [ ] **Step 3: Extend the schema and repository**

```typescript
// src/db/schema.ts — add these ALTER statements to initSchema, after the existing CREATE TABLE calls.
// SQLite has no "ADD COLUMN IF NOT EXISTS"; guard each with a try/catch so
// re-running initSchema on an already-migrated database is a no-op instead
// of throwing "duplicate column name".
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

  const addColumnIfMissing = async (table: string, columnDdl: string) => {
    try {
      await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
    } catch (error) {
      // SQLite throws when the column already exists — that's the expected
      // steady state on every run after the first. Anything else is real.
      if (!/duplicate column name/i.test(String(error))) {
        throw error;
      }
    }
  };

  await addColumnIfMissing('activities', 'server_id TEXT');
  await addColumnIfMissing('activities', 'conflict_server_activity TEXT');
  await addColumnIfMissing('checkpoints', 'server_id TEXT');
  await addColumnIfMissing('checkpoints', 'photo_uploaded INTEGER NOT NULL DEFAULT 0');
}
```

```typescript
// src/db/activitiesRepository.ts — updated types and additions

export interface Activity {
  id: string;
  title: string;
  notes: string | null;
  startedAt: string;
  endedAt: string | null;
  syncStatus: string;
  updatedAt: string;
  serverId: string | null;
  conflictServerActivity: string | null;
  routePoints: Array<RoutePointInput & { id: string }>;
  checkpoints: Array<CheckpointInput & { id: string; photoPath: string | null; serverId: string | null; photoUploaded: boolean }>;
}

export interface ActivitiesRepository {
  createActivity(input: { title: string; startedAt: string }): Promise<string>;
  addRoutePoint(activityId: string, point: RoutePointInput): Promise<string>;
  addCheckpoint(activityId: string, checkpoint: CheckpointInput): Promise<string>;
  setCheckpointPhotoPath(checkpointId: string, photoPath: string): Promise<void>;
  getActivity(activityId: string): Promise<Activity | null>;
  listActivities(): Promise<Activity[]>;
  updateActivityMetadata(activityId: string, changes: { title?: string; notes?: string }): Promise<void>;
  listPendingActivities(): Promise<Activity[]>;
  markActivitySynced(activityId: string, serverId: string, serverUpdatedAt: string): Promise<void>;
  markActivityConflict(activityId: string, serverActivityJson: string): Promise<void>;
  markCheckpointSynced(checkpointId: string, serverId: string): Promise<void>;
  markCheckpointPhotoUploaded(checkpointId: string): Promise<void>;
}

// inside createActivitiesRepository(db), update hydrate()'s returned object to include:
//   serverId: row.server_id ?? null,
//   conflictServerActivity: row.conflict_server_activity ?? null,
// and each checkpoint mapped as:
//   serverId: c.server_id ?? null,
//   photoUploaded: Boolean(c.photo_uploaded),
// then add these methods to the returned object:

    async listPendingActivities() {
      const res = await db.executeSql("SELECT * FROM activities WHERE sync_status = 'pending' ORDER BY started_at ASC", []);
      return Promise.all(res.rows.map(hydrate));
    },

    async markActivitySynced(activityId, serverId, serverUpdatedAt) {
      await db.executeSql(
        "UPDATE activities SET server_id = ?, sync_status = 'synced', updated_at = ? WHERE id = ?",
        [serverId, serverUpdatedAt, activityId],
      );
    },

    async markActivityConflict(activityId, serverActivityJson) {
      await db.executeSql(
        "UPDATE activities SET sync_status = 'conflict', conflict_server_activity = ? WHERE id = ?",
        [serverActivityJson, activityId],
      );
    },

    async markCheckpointSynced(checkpointId, serverId) {
      await db.executeSql('UPDATE checkpoints SET server_id = ? WHERE id = ?', [serverId, checkpointId]);
    },

    async markCheckpointPhotoUploaded(checkpointId) {
      await db.executeSql('UPDATE checkpoints SET photo_uploaded = 1 WHERE id = ?', [checkpointId]);
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest activitiesRepository`
Expected: PASS — all prior cases plus the three new ones green.

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat: add server-id and sync-status tracking columns to the local schema"
```

---

### Task 3: Auth screens

**Files:**
- Create: `src/store/authStore.ts`
- Create: `src/screens/LoginScreen.tsx`
- Create: `src/screens/RegisterScreen.tsx`
- Modify: `App.tsx` (add `Login`/`Register` routes; gate the initial route on whether a token is already stored)
- Test: `src/store/authStore.test.ts`
- Test: `src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `createApiClient`/`tokenStorage` (Task 1).
- Produces: `useAuthStore` — `status: 'checking' | 'signedOut' | 'signedIn'`, `login(email, password)`, `register(email, password)`, `logout()`, `restoreSession()` — `App.tsx` calls `restoreSession()` once on mount to decide the initial route.

- [ ] **Step 1: Write the failing store test**

```typescript
// src/store/authStore.test.ts
import { useAuthStore } from './authStore';

const mockApiClient = {
  login: jest.fn(),
  register: jest.fn(),
};
const mockTokenStorage = {
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
};

jest.mock('../api/apiClient', () => ({ createApiClient: () => mockApiClient }));
jest.mock('../api/tokenStorage', () => ({ tokenStorage: mockTokenStorage }));

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'checking' });
  });

  it('restoreSession() signs in immediately if a token is already stored', async () => {
    mockTokenStorage.getToken.mockResolvedValue('existing-token');

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('restoreSession() ends up signedOut with no stored token', async () => {
    mockTokenStorage.getToken.mockResolvedValue(null);

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('login() stores the returned token and signs in', async () => {
    mockApiClient.login.mockResolvedValue({ accessToken: 'new-token' });

    await useAuthStore.getState().login('a@example.com', 'password123');

    expect(mockTokenStorage.setToken).toHaveBeenCalledWith('new-token');
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('logout() clears the token and signs out', async () => {
    useAuthStore.setState({ status: 'signedIn' });

    await useAuthStore.getState().logout();

    expect(mockTokenStorage.clearToken).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest authStore`
Expected: FAIL — `Cannot find module './authStore'`.

- [ ] **Step 3: Implement the store**

```typescript
// src/store/authStore.ts
import { create } from 'zustand';
import { createApiClient } from '../api/apiClient';
import { tokenStorage } from '../api/tokenStorage';

export const API_BASE_URL = 'http://localhost:3000';

const apiClient = createApiClient(API_BASE_URL, () => tokenStorage.getToken());

interface AuthStoreState {
  status: 'checking' | 'signedOut' | 'signedIn';
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'checking',

  async restoreSession() {
    const token = await tokenStorage.getToken();
    set({ status: token ? 'signedIn' : 'signedOut' });
  },

  async login(email, password) {
    const { accessToken } = await apiClient.login(email, password);
    await tokenStorage.setToken(accessToken);
    set({ status: 'signedIn' });
  },

  async register(email, password) {
    const { accessToken } = await apiClient.register(email, password);
    await tokenStorage.setToken(accessToken);
    set({ status: 'signedIn' });
  },

  async logout() {
    await tokenStorage.clearToken();
    set({ status: 'signedOut' });
  },
}));

export { apiClient };
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `npx jest authStore`
Expected: PASS — all four cases green.

- [ ] **Step 5: Write the failing screen test**

```tsx
// src/screens/LoginScreen.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';
import { useAuthStore } from '../store/authStore';

jest.mock('../store/authStore');

describe('LoginScreen', () => {
  it('calls login with the entered email and password when Log In is pressed', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ login });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByText('Log In'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('a@example.com', 'password123'));
  });

  it('shows an error message when login rejects', async () => {
    const login = jest.fn().mockRejectedValue(new Error('Invalid email or password'));
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ login });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(screen.getByText('Log In'));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest LoginScreen`
Expected: FAIL — `Cannot find module './LoginScreen'`.

- [ ] **Step 7: Implement the screens**

```tsx
// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuthStore } from '../store/authStore';

export function LoginScreen() {
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={styles.input} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Log In" onPress={onSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 4 },
  error: { color: 'red' },
});
```

```tsx
// src/screens/RegisterScreen.tsx
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuthStore } from '../store/authStore';

export function RegisterScreen() {
  const { register } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    try {
      await register(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={styles.input} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Create Account" onPress={onSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 4 },
  error: { color: 'red' },
});
```

```tsx
// App.tsx — add Login/Register routes and gate the initial route on session restore
import React, { useEffect } from 'react';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { useAuthStore } from './src/store/authStore';
// ...inside the App component, before the returned JSX:
  const { status, restoreSession } = useAuthStore();
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (status === 'checking') {
    return null; // a splash/loading view would go here in a later polish pass
  }
// ...inside Stack.Navigator, choose the initial route based on status, and register both new screens:
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log In' }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
```

Note: wiring `initialRouteName` to `status === 'signedIn' ? 'Home' : 'Login'` on the existing `Stack.Navigator` is a one-line change at the call site — the exact diff depends on `App.tsx`'s current structure, so apply it directly against the real file rather than this snippet.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest LoginScreen`
Expected: PASS — both cases green.

- [ ] **Step 9: Commit**

```bash
git add src/store/authStore.ts src/screens/LoginScreen.tsx src/screens/RegisterScreen.tsx App.tsx src/store/authStore.test.ts src/screens/LoginScreen.test.tsx
git commit -m "feat: add login/register screens with session persistence"
```

---

### Task 4: SyncEngine

**Files:**
- Create: `src/sync/syncEngine.ts`
- Modify: `src/db/activitiesRepository.ts` (add `markActivityServerId`; also already required to add a `sync_status = 'pending'` reset to `updateActivityMetadata`, per Task 5's original note — moved earlier since this task's own tests need it)
- Test: `src/sync/syncEngine.test.ts`
- Test: extend `src/db/activitiesRepository.test.ts`

**Interfaces:**
- Consumes: `ActivitiesRepository` (Task 2's sync methods, plus `markActivityServerId` added by this task), `ApiClient` (Task 1).
- Produces: `createSyncEngine(repo, apiClient): { syncNow(): Promise<SyncSummary> }` where `SyncSummary = { synced: number; conflicts: number; failed: number }` — Task 5's UI calls `syncNow()` and reads the summary to show the user what happened. `ActivitiesRepository.markActivityServerId(activityId, serverId): Promise<void>` — records the server-assigned id on first contact *without* changing `sync_status` away from `'pending'`, so an activity whose checkpoint/photo sync is interrupted partway stays visible to the next `listPendingActivities()` call instead of vanishing (see the design note after Step 3).

- [ ] **Step 1: Write the failing test**

```typescript
// src/sync/syncEngine.test.ts
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

  it('resumes a partially-synced activity on retry instead of re-creating it or losing remaining checkpoints', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Two checkpoints', startedAt: '2026-09-21T13:00:00.000Z' });
    const checkpoint1Id = await repo.addCheckpoint(activityId, { lat: 10.4, lng: 106.4, capturedAt: '2026-09-21T13:05:00.000Z' });
    const checkpoint2Id = await repo.addCheckpoint(activityId, { lat: 10.5, lng: 106.5, capturedAt: '2026-09-21T13:10:00.000Z' });

    // First attempt: the activity itself and checkpoint 1 succeed;
    // checkpoint 2's creation fails partway (simulating a dropped
    // connection mid-sync).
    const failingApi = fakeApiClient({
      createCheckpoint: jest
        .fn()
        .mockResolvedValueOnce({ id: 'server-checkpoint-1' })
        .mockRejectedValueOnce(new Error('network dropped')),
    });
    const firstSummary = await createSyncEngine(repo, failingApi as any).syncNow();

    expect(firstSummary).toEqual({ synced: 0, conflicts: 0, failed: 1 });

    let activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('pending'); // must still be retryable, not silently lost
    expect(activity?.serverId).toBe('server-1'); // the activity itself was created
    expect(activity?.checkpoints.find((c) => c.id === checkpoint1Id)?.serverId).toBe('server-checkpoint-1'); // survived

    // Second attempt: everything succeeds. The activity must NOT be
    // re-created, and checkpoint 1 must NOT be re-created either — only
    // the still-outstanding checkpoint 2 should go up.
    const succeedingApi = fakeApiClient({
      createCheckpoint: jest.fn().mockResolvedValue({ id: 'server-checkpoint-2' }),
      // The retry finds activity.serverId already set, so pushActivity
      // takes the "already exists on the server" branch and calls
      // updateActivityMetadata (harmless re-push) before resuming the
      // checkpoint loop — this must resolve a real, non-conflict result,
      // not the fixture's bare default mock (which resolves `undefined`
      // and made `'conflict' in result` throw).
      updateActivityMetadata: jest.fn().mockResolvedValue({ id: 'server-1', title: 'Two checkpoints', updatedAt: '2026-09-21T14:00:00.000Z' }),
    });
    const secondSummary = await createSyncEngine(repo, succeedingApi as any).syncNow();

    expect(secondSummary).toEqual({ synced: 1, conflicts: 0, failed: 0 });
    expect(succeedingApi.createActivity).not.toHaveBeenCalled();
    expect(succeedingApi.createCheckpoint).toHaveBeenCalledTimes(1);
    expect(succeedingApi.createCheckpoint).toHaveBeenCalledWith('server-1', expect.objectContaining({ lat: 10.5, lng: 106.5 }));

    activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('synced');
    expect(activity?.checkpoints.find((c) => c.id === checkpoint2Id)?.serverId).toBe('server-checkpoint-2');
  });

  it('still pushes an outstanding checkpoint even when the metadata push conflicts', async () => {
    const db = createBetterSqliteAdapter();
    await initSchema(db);
    const repo = createActivitiesRepository(db);
    const activityId = await repo.createActivity({ title: 'Partially synced', startedAt: '2026-09-21T15:00:00.000Z' });
    const checkpointId = await repo.addCheckpoint(activityId, { lat: 10.6, lng: 106.6, capturedAt: '2026-09-21T15:05:00.000Z' });
    // Simulates: the activity itself already reached the server on an
    // earlier attempt, but its one checkpoint never made it up before
    // that attempt was interrupted.
    await repo.markActivityServerId(activityId, 'server-3', '2026-09-21T15:00:00.000Z');

    const api = fakeApiClient({
      updateActivityMetadata: jest.fn().mockResolvedValue({
        conflict: true,
        serverActivity: { id: 'server-3', title: 'Renamed elsewhere', updatedAt: '2026-09-21T16:00:00.000Z' },
      }),
      createCheckpoint: jest.fn().mockResolvedValue({ id: 'server-checkpoint-3' }),
    });
    const summary = await createSyncEngine(repo, api as any).syncNow();

    expect(summary).toEqual({ synced: 0, conflicts: 1, failed: 0 });
    expect(api.createCheckpoint).toHaveBeenCalledWith('server-3', expect.objectContaining({ lat: 10.6, lng: 106.6 }));

    const activity = await repo.getActivity(activityId);
    expect(activity?.syncStatus).toBe('conflict'); // metadata conflict still surfaced to the user
    expect(activity?.checkpoints.find((c) => c.id === checkpointId)?.serverId).toBe('server-checkpoint-3'); // but the checkpoint made it up anyway
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest syncEngine`
Expected: FAIL — `Cannot find module './syncEngine'`.

- [ ] **Step 3: Add `markActivityServerId` to the repository**

```typescript
// src/db/activitiesRepository.ts — add to the ActivitiesRepository interface
  markActivityServerId(activityId: string, serverId: string, serverUpdatedAt: string): Promise<void>;

// ...and to createActivitiesRepository(db)'s returned object, alongside the
// existing markActivitySynced/markActivityConflict/etc:
    async markActivityServerId(activityId, serverId, serverUpdatedAt) {
      // Deliberately does NOT touch sync_status — the activity stays
      // 'pending' (visible to listPendingActivities()) until the sync
      // engine has also finished pushing every checkpoint and photo. See
      // the design note after Step 4 for why this split matters.
      //
      // DOES record the server's updated_at (unlike an earlier draft of
      // this method, which left it alone). Without this, a retried sync's
      // clientUpdatedAt would still be the *local creation* timestamp, and
      // the backend's own conflict rule (current.updatedAt > clientSawAt)
      // would read that stale value as a real conflict on every resume —
      // wrongly, since nothing has actually changed. See the second design
      // note after Step 4.
      await db.executeSql(
        'UPDATE activities SET server_id = ?, updated_at = ? WHERE id = ?',
        [serverId, serverUpdatedAt, activityId],
      );
    },
```

- [ ] **Step 4: Implement the sync engine**

```typescript
// src/sync/syncEngine.ts
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
```

**Design note (from Task 4's review):** an earlier version of this file split `pushNewActivity`/`pushMetadataEdit` into two functions, routed by `activity.serverId ? pushMetadataEdit : pushNewActivity`, and `pushNewActivity` called `markActivitySynced` (flipping `sync_status` to `'synced'`) *before* looping over checkpoints. Since `SqlDatabase` has no transactions, a checkpoint or photo failure partway through that loop left the activity already marked `'synced'` with a real `server_id` — so it silently vanished from every future `listPendingActivities()` call, permanently stranding whatever checkpoints/photos hadn't made it up yet, with no error and no way to retry. The fix merges both functions into one `pushActivity`: `markActivityServerId` (new) records the server id *without* changing `sync_status`, the checkpoint/photo loop is written to be idempotent (skip anything that already has a `serverId`/`photoUploaded`), and `markActivitySynced` — the thing that actually removes the activity from the pending queue — only runs after that whole loop succeeds. A retried `syncNow()` on a partially-synced activity now skips `createActivity` entirely (since `serverId` is already set) and resumes exactly where it left off.

**Second design note (from re-review after the first fix):** the first fix above still had two holes. First, `markActivityServerId` originally left `updated_at` alone, so a retry's `clientUpdatedAt` was still the *local creation* timestamp — the real backend's conflict rule (`current.updatedAt > clientSawAt`) reads that stale value as a genuine conflict on every ordinary resume, not just on a real concurrent edit, since the server's own `updatedAt` (stamped when `createActivity` first ran) is always later than the phone's local creation time. `markActivityServerId` now also writes the server's `updatedAt`, so a plain resume's `clientUpdatedAt` matches what the server already has and doesn't trip the conflict check — while a genuine local edit still overwrites `updated_at` to local-now via `updateActivityMetadata`, which is still ≥ the server's last-known value, so real edits keep working correctly. Second, the original code `return`ed immediately on a metadata conflict, before the checkpoint loop ever ran — meaning the *common* case of "resume hits a conflict" (before the first fix above, that was almost every resume) abandoned any outstanding checkpoints exactly the way the original bug did, just reached through the conflict branch instead of an exception. The fix now records the conflict (`hadConflict = true`) but keeps going into the checkpoint loop regardless — checkpoints and photos are independent sub-resources of an already-created activity, so a metadata dispute over title/notes has no bearing on whether they should be pushed. The final `synced` vs. `conflict` decision happens only after that loop, so a resolved metadata conflict never comes at the cost of stranded checkpoints.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest syncEngine`
Expected: PASS — all seven cases green (the original five, the resume-after-partial-failure case, and the conflict-still-pushes-checkpoints case).

- [ ] **Step 6: Commit**

```bash
git add src/sync src/db/activitiesRepository.ts src/db/activitiesRepository.test.ts
git commit -m "feat: add SyncEngine pushing pending activities, checkpoints, and photos"
```

---

### Task 5: Sync trigger UI and conflict resolution

**Files:**
- Modify: `src/screens/HistoryScreen.tsx` (add a "Sync now" button and per-item sync-status/conflict indicator)
- Create: `src/screens/ConflictResolutionScreen.tsx`
- Modify: `App.tsx` (add `ConflictResolution` route)
- Test: extend `src/screens/HistoryScreen.test.tsx`
- Test: `src/screens/ConflictResolutionScreen.test.tsx`

**Interfaces:**
- Consumes: `createSyncEngine` (Task 4), `apiClient`/`tokenStorage` (Task 1, to construct the engine), `ActivitiesRepository.updateActivityMetadata`/`markActivitySynced` (to apply a user's conflict resolution choice).
- Produces: nothing new consumed elsewhere — these are leaf screens, the last task in this plan.

- [ ] **Step 1: Write the failing test for the sync button**

```tsx
// src/screens/HistoryScreen.test.tsx (add this case to the existing file)
it('runs sync and shows a summary when "Sync now" is pressed', async () => {
  jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
    listActivities: jest.fn().mockResolvedValue([]),
  } as any);
  const syncNow = jest.fn().mockResolvedValue({ synced: 2, conflicts: 1, failed: 0 });
  jest.spyOn(syncEngineModule, 'createSyncEngine').mockReturnValue({ syncNow });

  render(<HistoryScreen />);
  fireEvent.press(screen.getByText('Sync now'));

  await waitFor(() => expect(screen.getByText('Synced 2, 1 conflict')).toBeTruthy());
});
```

Add the matching import at the top of the test file: `import * as syncEngineModule from '../sync/syncEngine';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest HistoryScreen`
Expected: FAIL — no "Sync now" text found.

- [ ] **Step 3: Add the sync button to HistoryScreen**

```tsx
// src/screens/HistoryScreen.tsx — add imports and state, and render a "Sync now" button above the list
import { useState } from 'react';
import { createSyncEngine, SyncSummary } from '../sync/syncEngine';
import { apiClient } from '../store/authStore';
// ...inside HistoryScreen, alongside the existing `activities` state:
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  const onSyncPress = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    const engine = createSyncEngine(repo, apiClient);
    const summary = await engine.syncNow();
    setSyncSummary(summary);
  };

  const summaryText = (summary: SyncSummary) =>
    `Synced ${summary.synced}, ${summary.conflicts} conflict${summary.conflicts === 1 ? '' : 's'}`;
// ...inside the returned JSX, above the FlatList:
      <Button title="Sync now" onPress={onSyncPress} />
      {syncSummary && <Text>{summaryText(syncSummary)}</Text>}
```

Note: apply this against `HistoryScreen.tsx`'s actual current structure (it already imports `Text`/`View`/`FlatList`/`TouchableOpacity` and `createSqliteStorageAdapter`/`createActivitiesRepository` from Task 7 of the mobile-core plan) — add `Button` to the existing `react-native` import line rather than a new one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest HistoryScreen`
Expected: PASS.

- [ ] **Step 5: Write the failing test for conflict resolution**

```tsx
// src/screens/ConflictResolutionScreen.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ConflictResolutionScreen } from './ConflictResolutionScreen';
import * as repoModule from '../db/activitiesRepository';

jest.mock('../db/sqliteStorageAdapter', () => ({ createSqliteStorageAdapter: jest.fn() }));

describe('ConflictResolutionScreen', () => {
  const localActivity = {
    id: 'local-1',
    title: 'My renamed hike',
    conflictServerActivity: JSON.stringify({ id: 'server-1', title: 'Server renamed hike', updatedAt: '2026-09-21T12:00:00.000Z' }),
  };

  it('shows both versions and lets the user keep the local one', async () => {
    const updateActivityMetadata = jest.fn();
    const markActivitySynced = jest.fn();
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue(localActivity),
      updateActivityMetadata,
      markActivitySynced,
    } as any);

    render(<ConflictResolutionScreen route={{ params: { activityId: 'local-1' } } as any} />);

    await waitFor(() => expect(screen.getByText('My renamed hike')).toBeTruthy());
    expect(screen.getByText('Server renamed hike')).toBeTruthy();

    fireEvent.press(screen.getByText('Keep mine'));

    await waitFor(() => expect(markActivitySynced).toHaveBeenCalledWith('local-1', 'server-1', '2026-09-21T12:00:00.000Z'));
  });

  it('lets the user take the server version instead', async () => {
    const updateActivityMetadata = jest.fn();
    const markActivitySynced = jest.fn();
    jest.spyOn(repoModule, 'createActivitiesRepository').mockReturnValue({
      getActivity: jest.fn().mockResolvedValue(localActivity),
      updateActivityMetadata,
      markActivitySynced,
    } as any);

    render(<ConflictResolutionScreen route={{ params: { activityId: 'local-1' } } as any} />);
    await waitFor(() => expect(screen.getByText('My renamed hike')).toBeTruthy());

    fireEvent.press(screen.getByText('Take server version'));

    await waitFor(() => expect(updateActivityMetadata).toHaveBeenCalledWith('local-1', { title: 'Server renamed hike' }));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest ConflictResolutionScreen`
Expected: FAIL — `Cannot find module './ConflictResolutionScreen'`.

- [ ] **Step 7: Implement the screen**

```tsx
// src/screens/ConflictResolutionScreen.tsx
import React, { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Activity, createActivitiesRepository } from '../db/activitiesRepository';
import { createSqliteStorageAdapter } from '../db/sqliteStorageAdapter';

interface Props {
  route: { params: { activityId: string } };
}

export function ConflictResolutionScreen({ route }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    (async () => {
      const db = await createSqliteStorageAdapter();
      const repo = createActivitiesRepository(db);
      const found = await repo.getActivity(route.params.activityId);
      setActivity(found);
    })();
  }, [route.params.activityId]);

  if (!activity || !activity.conflictServerActivity) return null;

  const serverActivity = JSON.parse(activity.conflictServerActivity);

  const keepMine = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    await repo.markActivitySynced(activity.id, serverActivity.id, serverActivity.updatedAt);
  };

  const takeServerVersion = async () => {
    const db = await createSqliteStorageAdapter();
    const repo = createActivitiesRepository(db);
    await repo.updateActivityMetadata(activity.id, { title: serverActivity.title });
  };

  return (
    <View>
      <Text>Your version</Text>
      <Text>{activity.title}</Text>
      <Text>Server version</Text>
      <Text>{serverActivity.title}</Text>
      <Button title="Keep mine" onPress={keepMine} />
      <Button title="Take server version" onPress={takeServerVersion} />
    </View>
  );
}
```

```tsx
// App.tsx (add the ConflictResolution route)
import { ConflictResolutionScreen } from './src/screens/ConflictResolutionScreen';
// ...inside Stack.Navigator:
        <Stack.Screen name="ConflictResolution" component={ConflictResolutionScreen} options={{ title: 'Resolve conflict' }} />
```

Note: `takeServerVersion`'s next real sync pass will push this activity's metadata again — since `updateActivityMetadata` here only updates local title/notes (not `sync_status`, which stays `'conflict'` after this call in the repository method as currently written), a full resolution flow would also need to flip `sync_status` back to `'pending'` so the next `syncNow()` retries it. This plan intentionally leaves that as a one-line follow-up rather than adding a sixth repository method for it — flag it in your task report rather than silently adding scope, and if there's time, add `sync_status = 'pending'` to the end of `updateActivityMetadata`'s existing UPDATE statements in Task 2's file instead of introducing a new method.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest ConflictResolutionScreen`
Expected: PASS — both cases green.

- [ ] **Step 9: Commit**

```bash
git add src/screens/HistoryScreen.tsx src/screens/ConflictResolutionScreen.tsx App.tsx src/screens/HistoryScreen.test.tsx src/screens/ConflictResolutionScreen.test.tsx
git commit -m "feat: add sync trigger and conflict resolution UI"
```

---

## Self-Review Notes

- **Spec coverage:** login/register with session persistence ✅ (Task 3), typed API client for every backend endpoint ✅ (Task 1), pushing pending activities/route points/checkpoints/photos ✅ (Task 4), conflict surfaced to the user rather than silently discarded ✅ (Task 5), local schema support for server-id mapping ✅ (Task 2). Automatic/background sync triggering is explicitly out of scope (manual "Sync now" only) — a deliberate simplification stated in Global Constraints, not an oversight.
- **Placeholder scan:** the one open item (Task 5's note about `sync_status` not resetting to `'pending'` after "take server version") is flagged explicitly as a known follow-up with an exact fix, not a silent gap — consistent with how the mobile-core and backend plans handled similar deferred items.
- **Type consistency:** `ApiClient`'s method signatures (Task 1) are the exact ones `SyncEngine` (Task 4) and the auth store (Task 3) call; `Activity`'s new `serverId`/`conflictServerActivity` fields (Task 2) are the exact ones `SyncEngine` and `ConflictResolutionScreen` (Task 5) read; `SyncSummary`'s `{ synced, conflicts, failed }` shape is used identically in `syncEngine.ts` and `HistoryScreen.tsx`.
- **Interface reconciliation with the real backend:** every request/response shape in Task 1's `ApiClient` matches the backend's actual, already-shipped DTOs and routes exactly (`CreateActivityDto`, `UpdateActivityDto`, `CreateCheckpointDto`, the `200`+`{conflict:true}` response shape, the checkpoint photo upload/retrieval routes added in the backend's Task 7) — not the originally-imagined versions from the design spec.
