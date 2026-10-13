# TrailLog

An offline-first outdoor activity tracker. It records GPS routes for walks, runs and hikes, attaches photo checkpoints along the way, counts steps from the accelerometer, and syncs everything to a self-hosted backend once the phone is back online.

The project is a **React Native + NestJS** monorepo. It was built to learn React Native in depth coming from Flutter, and it focuses on the parts where the two platforms differ most: background location, native modules, and local-first data sync.

> **Status: work in progress.** The TypeScript layers (tracking logic, local database, sync engine, screens, backend API) are implemented and covered by tests. The Android app builds (`local` and `staging` variants) but hasn't been exercised on a physical device yet; the iOS project is configured but hasn't been built (no Mac in the loop). See [Known limitations](#known-limitations).

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
├── android/, ios/           # Native projects (Android: local/staging flavors)
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
- Docker Desktop (for the local environment)
- For the app: Android Studio with the Android SDK and JDK 17+ (Xcode on a Mac for iOS)

## Environments

| | Local | Staging |
|---|---|---|
| Purpose | Develop and test on your home network | Test against a real public HTTPS URL |
| API | Docker on your PC, `http://<PC LAN IP>:3000` | [Render](https://render.com) free web service (`render.yaml`) |
| Database | Postgres 15 in Docker | [Neon](https://neon.com) free Postgres |
| Photos | Local disk (`STORAGE_DRIVER=local`) | [Cloudflare R2](https://developers.cloudflare.com/r2/) (`STORAGE_DRIVER=s3`) |
| Cost | $0 | $0 (optional custom domain ≈ $10/year) |

The server validates its environment at startup (`backend/src/config/env.validation.ts`). It refuses to boot without `DATABASE_URL` and `JWT_SECRET`, with an incomplete S3 config, or with the `.env.example` placeholder secret in production.

### Local

```bash
cd backend
cp .env.example .env              # set JWT_SECRET to any value
docker compose up -d --build      # Postgres + API, migrations applied on boot
curl http://localhost:3000/health # {"status":"ok"}
```

To test from a phone on the same Wi-Fi, use `http://<your PC's LAN IP>:3000` (find it with `ipconfig`), and allow inbound TCP 3000 in Windows Firewall:

```powershell
New-NetFirewallRule -DisplayName "TrailLog API (dev)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

For backend development with hot reload, run only the database in Docker and the API on the host:

```bash
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run start:dev
```

### Staging

One-time setup:

1. **Neon:** create a project in the Singapore region (`aws-ap-southeast-1`) and copy its connection string (`...?sslmode=require`).
2. **Cloudflare R2:** create a bucket named `traillog-staging`, plus an R2 API token with Object Read & Write on that bucket. Note the S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`, the access key ID, and the secret.
3. **Render:** New → Blueprint → select this repo. Render reads `render.yaml` and asks for `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`. `JWT_SECRET` is generated automatically.

After that, every push to `master` that touches `backend/` deploys once the GitHub Actions checks pass. The API is served at `https://traillog-api-staging.onrender.com`; a custom domain can be added later under the service's Settings → Custom Domains.

Free-tier behaviour to expect: the API sleeps after 15 minutes without requests and takes about a minute to wake up, and Neon's database suspends after 5 minutes idle and resumes in a few seconds.

### Mobile

```bash
npm install
npm run lint
npm run typecheck
npm test
```

The app has one Android build variant per environment. Each reads its own env file at build time ([react-native-config](https://github.com/lugg/react-native-config)) and has its own application ID, so both can be installed side by side:

| Variant | Env file | App name | API |
|---|---|---|---|
| `local` | `.env.local` (gitignored; copy from `.env.local.example`) | TrailLog (local) | `http://<PC LAN IP>:3000` |
| `staging` | `.env.staging` (committed) | TrailLog (staging) | `https://traillog-api-staging.onrender.com` |

```bash
cp .env.local.example .env.local   # then set API_BASE_URL to your PC's LAN IP
npm run android:local              # debug build against the local API (Metro serves the JS)
npm run android:staging            # debug build against staging
npm run android:staging:release    # standalone release build against staging (no Metro needed)
```

`src/config/appConfig.ts` validates the values at startup. If the env file was missing at build time, the app throws a clear error instead of calling `undefined/auth/login`. Changing an env file requires rebuilding the app, not just reloading the JS.

iOS uses `.env.local` for the Debug configuration and `.env.staging` for Release (set in `ios/Podfile`). Run `cd ios && pod install` on a Mac first; the iOS project hasn't been built yet.

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
| `npx detox test -c android.emu.debug` | repo root | End-to-end background-tracking flow (Detox native test setup not added yet) |

CI workflows live in [.github/workflows/](.github/workflows/). The Detox job only runs on manual `workflow_dispatch`.

## Known limitations

This is an honest list of what isn't done yet:

- **Not yet tested on a real device.** Background tracking, camera and sensors are verified through unit tests with mocks and an Android compile; iOS hasn't been built.
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
