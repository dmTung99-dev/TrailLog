# TrailLog

An offline-first outdoor activity tracker. It records GPS routes for walks, runs and hikes, attaches photo checkpoints along the way, counts steps from the accelerometer, and syncs everything to a self-hosted backend once the phone is back online.

The project is a **React Native + NestJS** monorepo. It was built to learn React Native in depth coming from Flutter, and it focuses on the parts where the two platforms differ most: background location, native modules, and local-first data sync.

> **Status: work in progress.** The TypeScript layers (tracking logic, local database, sync engine, screens, backend API) are implemented and covered by tests. The native `android/` and `ios/` projects are **not generated yet**. Those folders contain only the manifest/plist entries the app needs. Until `npx react-native init` output is merged in, the app can't be built or run on a device or emulator. See [Known limitations](#known-limitations).

## Features

- **Background GPS tracking.** Recording continues with the screen off: Android uses a foreground service, iOS uses the `location` background mode. Start, pause, resume and stop are enforced by an explicit state machine.
- **Offline-first storage.** Every route point, checkpoint and photo path goes to on-device SQLite first. Recording never waits on the network.
- **Photo checkpoints.** Geotagged photos, taken with `react-native-vision-camera`, at the last known position.
- **Step counting.** Peak detection on the accelerometer signal, with a debounce, accumulated over the whole session.
- **Resumable sync.** Pending activities are pushed to the backend together with their checkpoints and photos. If a sync is interrupted, the next attempt picks up where it stopped instead of starting over or losing data.
- **Conflict handling.** The server detects stale metadata edits, and the app asks the user to keep their version or take the server's.
- **Permission handling.** Platform permission results are normalized, including Android 12+ "approximate location only", with graceful degradation: motion permission is optional, location is required.

## Tech stack

| Layer | Stack |
|---|---|
| Mobile | React Native 0.75, TypeScript, Zustand, React Navigation (native stack), react-native-sqlite-storage, react-native-background-actions, react-native-geolocation-service, react-native-sensors, react-native-vision-camera, react-native-maps |
| Backend | NestJS 10, Prisma 5, PostgreSQL 15, Passport JWT, bcrypt, class-validator |
| Testing | Jest, React Native Testing Library, better-sqlite3 (in-memory SQLite test double), Supertest, Detox |
| CI | GitHub Actions (lint, typecheck, unit tests; backend tests against a real Postgres service container) |

## Repository layout

```
.
├── App.tsx                  # Navigation root + session restore
├── src/
│   ├── api/                 # Typed REST client, token storage
│   ├── db/                  # SQLite adapter, schema/migrations, activities repository
│   ├── sync/                # SyncEngine (push pending activities, checkpoints, photos)
│   ├── tracking/            # LocationTrackingService + pure TrackingStateMachine
│   ├── sensors/             # PedometerService + pure step detector
│   ├── permissions/         # Normalized location/camera/motion permissions
│   ├── camera/              # Photo capture wrapper
│   ├── store/               # Zustand stores (auth, tracking)
│   └── screens/             # Home, Tracking, History, Summary, Login, Register, ConflictResolution
├── test/support/            # better-sqlite3 adapter used as a real-SQL test double
├── e2e/                     # Detox end-to-end spec
├── android/, ios/           # Placeholder native config (not buildable yet)
├── backend/                 # NestJS API (see below)
└── docs/                    # Design spec, implementation plans, knowledge spec
```

## Architecture

```
 Tracking screen ──> trackingStore ──┬─> LocationTrackingService ──> GPS (foreground service / iOS bg mode)
                                     ├─> PedometerService ─────────> accelerometer
                                     └─> ActivitiesRepository ─────> SQLite (source of truth on device)
                                                                          │
 History screen ── "Sync now" ──> SyncEngine ── reads pending ────────────┘
                                     │
                                     └─> ApiClient ──HTTP/JWT──> NestJS ──Prisma──> PostgreSQL
                                                                   └──> local disk (checkpoint photos)
```

- The **on-device SQLite database** is the source of truth while recording or offline. Each activity carries a `sync_status` (`pending` / `synced` / `conflict`) and a `server_id`.
- **SyncEngine** depends only on two interfaces (`ActivitiesRepository`, `ApiClient`). It records the server id as soon as an activity is created remotely, skips checkpoints and photos that already reached the server, and marks an activity `synced` or `conflict` only after every checkpoint and photo in that pass has succeeded.
- The **backend** has one module per concern: `auth`, `activities`, `storage`, `prisma`. Photo storage sits behind an injectable `StorageService` interface, so swapping the local-disk implementation for S3 means registering a different class.

Deeper write-ups:
- [docs/superpowers/specs/2026-09-06-traillog-design.md](docs/superpowers/specs/2026-09-06-traillog-design.md): original design spec
- [docs/superpowers/plans/](docs/superpowers/plans/): implementation plans, including the design notes behind each sync and background-tracking fix
- [docs/traillog-knowledge-spec.md](docs/traillog-knowledge-spec.md): concepts and code walkthrough (Vietnamese)

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for the local PostgreSQL)
- For running the app later: a React Native environment (Android Studio / Xcode) and generated native projects

### Backend

```bash
cd backend
cp .env.example .env            # DATABASE_URL and JWT_SECRET
docker compose up -d            # PostgreSQL 15 on localhost:5432
npm install
npx prisma migrate deploy       # apply migrations
npm run start:dev               # http://localhost:3000
```

Check it's up: `curl http://localhost:3000/health` → `{"status":"ok"}`.

> Always set `JWT_SECRET` to a long random value. If it's missing, the server falls back to a placeholder string.

### Mobile

```bash
npm install
npm run lint
npm run typecheck
npm test
```

To run on a device you first need to generate the native projects (`npx react-native init` with RN 0.75), then merge in the entries from `android/app/src/main/AndroidManifest.xml` and `ios/TrailLogMobile/Info.plist`. The API base URL is set in `src/store/authStore.ts` (`http://localhost:3000`). Change it to `http://10.0.2.2:3000` for the Android emulator, or to your machine's LAN address for a physical device.

## API

All `/activities` routes need `Authorization: Bearer <token>`. Resources owned by another user return `404`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/auth/register` | `{ email, password }` → `{ accessToken }` (password ≥ 8 chars; `409` if the email exists) |
| `POST` | `/auth/login` | `{ email, password }` → `{ accessToken }` |
| `POST` | `/activities` | Create an activity with nested `routePoints` |
| `GET` | `/activities` | List the caller's activities (newest first) |
| `GET` | `/activities/:id` | Get one activity with route points and checkpoints |
| `PATCH` | `/activities/:id` | Update `title` / `notes` / `visibility` with `clientUpdatedAt`; returns `{ conflict: true, serverActivity }` if the server copy is newer |
| `POST` | `/activities/:id/checkpoints` | Create a checkpoint `{ lat, lng, capturedAt }` |
| `POST` | `/activities/:id/checkpoints/:checkpointId/photo` | Upload a checkpoint photo (multipart field `photo`) |
| `GET` | `/activities/:id/checkpoints/:checkpointId/photo` | Download a checkpoint photo |

## Testing

| Command | Where | What it covers |
|---|---|---|
| `npm test` | repo root | Mobile unit and component tests (repository and sync engine run real SQL against in-memory SQLite; native modules are mocked) |
| `npm test` | `backend/` | Backend unit tests (conflict-detection rules) |
| `npm run test:e2e` | `backend/` | API tests against a real PostgreSQL (needs `DATABASE_URL`) |
| `npx detox test -c android.emu.debug` | repo root | End-to-end background-tracking flow (needs generated native projects) |

CI workflows live in [.github/workflows/](.github/workflows/). The Detox job only runs on manual `workflow_dispatch`.

## Known limitations

This is an honest list of what isn't done yet:

- **No buildable native projects.** Background tracking, camera and sensors are verified only through mocks so far.
- **Sync is push-only and manual.** There is no pull of activities created on other devices, no automatic trigger when connectivity returns, and no retry with backoff.
- **Server-side creates are not idempotent.** If a create request succeeds but its response is lost, the next sync creates a duplicate.
- **Conflict detection compares the local edit time with the server's `updatedAt`.** In effect this is last-write-wins by device clock, not a true "both sides changed" check.
- **Route points are only sent when the activity is first created.** Points recorded after a mid-activity sync never reach the server.
- **`ended_at` is never recorded.**
- **Auth gaps:**
  - Access tokens only (7 days), no refresh tokens.
  - The token is stored in unencrypted AsyncStorage.
  - A `401` response doesn't sign the user out.
- **Navigation gaps:** logging in doesn't navigate away from the Login screen, and there is no link to Register and no logout button.
- **Local-disk photo storage.** The design calls for S3-compatible storage.
