# TrailLog — Design Spec

Date: 2026-09-06
Status: Approved for planning

## Purpose

The author is a mobile developer with 4 years of Flutter experience who wants a
new project to build depth in React Native and compare its paradigms and
native-module ecosystem against Flutter. The project is deliberately chosen to
sit in a different problem domain from the author's existing project
(`lexi-core`, a language-learning app), and to be scoped seriously enough to
demonstrate mid/senior-level engineering — not a tutorial-grade toy app.

TrailLog is an outdoor activity tracker: it records GPS routes for
walks/runs/hikes, lets the user attach photo checkpoints along the route,
counts steps via the device pedometer, and syncs activities across devices
through a self-written backend. The core technical bet is background location
tracking, because iOS and Android differ the most here, and RN's handling of
it differs sharply from Flutter's — this is the single feature most likely to
teach real native-module lessons.

## Goals

- Record a GPS route in real time, including while the app is backgrounded or
  the screen is off, on both Android and iOS.
- Attach geotagged photo checkpoints to a route during recording.
- Count steps during an activity using the device pedometer/accelerometer.
- Work fully offline during recording — no network dependency while tracking.
- Sync completed activities (route, checkpoints, photos) to a self-written
  backend once connectivity is available, across multiple devices per user.
- Resolve sync conflicts when the same activity's metadata (title, notes,
  visibility) is edited from two devices before either has synced.
- Have a testing strategy focused on the riskiest logic (sync/conflict
  resolution, background tracking lifecycle), not blanket coverage for its
  own sake.
- Run CI (lint, typecheck, unit tests) on both the mobile app and backend.

## Non-goals

- Social features (following other users, public feeds, comments).
- Route discovery/recommendation, elevation profile enrichment, or any
  third-party mapping/enrichment API beyond basic map rendering.
- Real-time multi-user tracking (e.g., seeing a friend's live location).
- Payment/monetization of any kind.
- Supporting platforms other than iOS and Android (no web build of the RN app).
- Perfect background-execution reliability on iOS: the spec explicitly
  accepts iOS's OS-level throttling of background location as a known,
  documented platform limitation rather than something to engineer around.

## Architecture

Two deployable units:

1. **Mobile app (React Native)** — offline-first client. Every user action
   during an activity (GPS point captured, step counted, checkpoint photo
   taken) is written to a local database first and never blocks on network
   access. The local database is the source of truth while an activity is in
   progress or the device is offline.
2. **Backend (NestJS + PostgreSQL)** — the cross-device source of truth once
   data is synced. Owns auth, persists activities, stores checkpoint photos,
   and arbitrates conflicts when the same activity has been modified on more
   than one device.

The two units communicate only through a versioned REST API; the mobile app
never assumes the backend is reachable.

### Mobile components

- **LocationTrackingService** — wraps platform background-location APIs
  (Android foreground service with a persistent notification; iOS background
  location mode). Exposes a plain start/pause/resume/stop interface and emits
  route points; has no knowledge of UI, storage, or sync, so it can be tested
  and reasoned about in isolation.
- **PedometerService** — wraps the native step-counting API behind the same
  kind of minimal interface.
- **CameraService** — wraps photo capture and returns a local file reference
  plus the coordinate/timestamp at capture time.
- **PermissionsManager** — centralizes the location/camera/motion permission
  requests and their denied/degraded states (e.g., Android 12+ "approximate
  location only"), so every screen queries one place instead of re-implementing
  permission logic.
- **Local database** (WatermelonDB or plain SQLite) — models: `Activity`,
  `RoutePoint`, `Checkpoint`. This is what screens read from; it is populated
  directly by the services above during recording and reconciled with the
  backend by the sync engine afterward.
- **SyncEngine** — a queue-based background process, separate from the UI,
  that pushes completed activities to the backend and pulls down
  activities/edits from other devices. Route-point data (small, frequent) is
  synced independently from checkpoint photos (larger, slower), so a slow
  photo upload never blocks route data from reaching the backend. Retries use
  exponential backoff. This is the most complex logic in the app and the
  primary target for unit testing.
- **State management** (Redux Toolkit or Zustand — pick one during planning)
  + React Navigation, covering: live tracking screen, activity summary
  screen, history list, checkpoint capture, auth screens, settings.

### Backend components

- **Auth module** — email/password or OAuth login, JWT access tokens with
  refresh tokens.
- **Activities module** — CRUD for activities and their route points/
  checkpoints; every activity record carries an `updatedAt` used for conflict
  detection.
- **Storage** — checkpoint photo upload to S3-compatible object storage,
  referenced by URL from the activity record.
- **Database** — PostgreSQL via Prisma or TypeORM (pick one during planning),
  with explicit migrations from day one.

## Data flow

1. User starts an activity. `LocationTrackingService` begins emitting route
   points, `PedometerService` begins counting steps, both written to the
   local database in real time. The user may capture checkpoint photos via
   `CameraService` at any point; each is geotagged from the current route
   position.
2. User stops the activity. It is marked complete locally and enqueued for
   sync — this works identically whether or not the device currently has
   connectivity.
3. When connectivity is available, `SyncEngine` pushes the activity's route
   points, then uploads checkpoint photos, then requests the
   backend-assigned canonical record. Failures are retried with backoff;
   nothing is marked synced until the backend confirms it.
4. Conflict handling: route point data is append-only and created once, so it
   essentially cannot conflict. The real conflict surface is activity
   metadata (title, notes, visibility) edited on two devices before either
   synced. Resolution is `updatedAt`-based last-write-wins, except when both
   local and remote have changed since the last successful sync — that case
   is surfaced to the user to pick a version rather than silently discarded.
5. The history screen always reads from the local database, which the sync
   engine keeps reconciled with the backend, so history remains usable
   offline even for activities that originated on another device.

## Error handling

- **Permission denied or degraded** (e.g., Android 12+ approximate-only
  location): the app records what it can and visibly warns the user the
  route may be imprecise, rather than failing the activity outright.
- **OS kills or throttles background execution**: Android uses a foreground
  service with a persistent notification specifically to reduce the chance of
  this. iOS's stricter background throttling is treated as a real platform
  constraint and documented in-app (e.g., "very long background sessions may
  lose GPS precision on iOS") rather than treated as a bug to eliminate.
- **Network failure during sync**: no data loss — the local database remains
  authoritative until the backend confirms receipt; the sync queue retries
  rather than dropping the activity.
- **Photo upload failure**: retried independently of route-data sync so a
  large/slow photo never blocks the rest of an activity from syncing.

## Testing strategy

Coverage is concentrated on the logic most likely to hide real bugs, not
spread evenly:

- **Backend**: unit tests for the conflict-resolution logic specifically
  (this is where subtle bugs would hide), plus integration tests against a
  real test PostgreSQL instance for the Activities and Auth modules.
- **Mobile**: unit tests for `SyncEngine` (queueing, retry/backoff, conflict
  surfacing), component tests via React Native Testing Library for the
  tracking and summary screens, and an end-to-end test (Detox) for the
  critical path: start tracking → background the app → resume → stop →
  verify the summary matches what was recorded.
- **CI**: GitHub Actions runs lint, typecheck, and unit tests on every push
  for both the mobile app and backend. End-to-end tests run separately
  (e.g., nightly) given the emulator cost.

## Open decisions deferred to the implementation plan

- Redux Toolkit vs. Zustand for mobile state management.
- WatermelonDB vs. plain SQLite for the local database.
- Prisma vs. TypeORM for the backend.
- Exact object storage provider for checkpoint photos (S3 vs. a compatible
  alternative).
