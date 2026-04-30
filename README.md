# time2leave

Know exactly when to leave. Sign in with Google, save up to a few
"trips" (origin → destination address pairs), and see a
15-minute-resolution heatmap of expected drive times for the current
week, in both directions, 06:00 – 21:00, every day Mon-Sun.

Lives at https://time2leave.com (and still deploys under the legacy
`traffic.larsjohansen.com` during migration).

- **Backend** — FastAPI + MySQL + APScheduler. Friday-23:00-PT job samples
  Google's Routes Matrix API for every active trip and stores per-slot
  durations in `commute_samples`. Per-user trip caps and a hard ceiling on
  weekly Routes Matrix calls keep the API budget under control.
- **Frontend** — React Router 7 SPA (SSR disabled) with MUI. Animated
  splash for logged-out users, Google Identity Services sign-in,
  authenticated trips list / new-trip form / detail view with both
  directions and live backfill polling.
- **Auth** — Stateless JWT session cookies, gated by an email allowlist
  managed in the `auth_allowlist` table (admin endpoints + bootstrap-
  from-env).

## Quickstart

```bash
make install      # set up backend venv + frontend node_modules
make dev-be       # mysql + api in docker (schema + dev user seeded automatically)
make dev-fe       # frontend on http://localhost:5173
```

Open http://localhost:5173, click **"Continue as dev user"** (the
seeded `dev@example.com` is pre-allowlisted) — you'll land on `/trips`
with one trip already populated. No Google Maps API key, OAuth client,
or AWS credentials required.

> **Upgrading from the single-user schema?** The `docker-entrypoint-initdb.d`
> scripts only run on a fresh MySQL volume. Run `make clean && make dev-be`
> once to wipe the old `commute_slots`-era volume and let the new
> multi-user schema + dev-user seed apply.

Run `make help` for the full target list (`test`, `typecheck`, `logs`,
`seed`, `clean`, `deploy-frontend`, …).

## Architecture

```
                          (Friday 23:00 PT — APScheduler, prod)
                                     │
                                     ▼
                    enumerate active trips (per user)
                                     │
              CommuteProvider — Google Routes Matrix  |  FixtureProvider
                                     │
                                     ▼
              MySQL  commute_samples  (trip_id, week, direction, hhmm, …)
                                     │
                                     ▼
                          FastAPI  /api/v1/...
       /auth/google · /auth/dev-login · /me · /auth/logout
       /trips · /trips/{id} · /trips/{id}/heatmap
       /admin/allowlist · /admin/run-data-gathering
                                     │
                                     ▼
              React SPA (CloudFront → S3 in prod, Vite dev server locally)
```

### Data lifecycle

| Event | What happens |
| --- | --- |
| User creates a trip | `POST /trips` returns the new trip immediately and kicks off `backfill_trip_current_week` in a background task. The frontend polls `/backfill-status` every 4 s and re-renders the heatmap as cells fill in. |
| Friday 23:00 PT cron | `main()` enumerates every active trip, refuses to start if `slots_per_trip × trips > MAX_WEEKLY_ROUTES_CALLS`, then upserts empty samples for next week before filling them via the configured `CommuteProvider`. |
| User deletes a trip | Soft-delete (`deleted_at = NOW()`); samples are preserved but the trip stops being refreshed and disappears from `/trips`. |

### Quotas and cost ceilings

| Knob | Default | Purpose |
| --- | --- | --- |
| `MAX_TRIPS_PER_USER` | 3 | Hard cap on active trips per user. |
| `MAX_TRIPS_TOTAL` | 150 | Global hard cap. New trips return 409 once reached. |
| `MAX_WEEKLY_ROUTES_CALLS` | 150 000 | Friday cron aborts before any call if it would exceed this. |
| Slots per trip per week | 60 × 15 × 7 × 2 = 12 600 | (60 quarter-hours of 06:00-21:00) × 7 days × 2 directions. |

## Backend

Location: [`backend/`](backend/).

### Layout
- Entry point: [`app/main.py`](backend/app/main.py) — `create_app()` factory wires routers, lifecycle, and APScheduler.
- Configuration: [`app/config.py`](backend/app/config.py) — typed `Settings` via `pydantic-settings`. In prod, secrets overlay from AWS Secrets Manager.
- Auth: [`app/auth/`](backend/app/auth) — Google ID-token verification, JWT session issuance/verification, FastAPI dependencies.
- Services: [`app/services/`](backend/app/services) — `users`, `trips`, `allowlist` business logic.
- Routers:
  - [`app/api/auth_api.py`](backend/app/api/auth_api.py) — `/auth/google`, `/auth/dev-login`, `/auth/logout`, `/me`, `/auth/config`.
  - [`app/api/trips_api.py`](backend/app/api/trips_api.py) — per-user trip CRUD + heatmap + backfill status.
  - [`app/api/admin_api.py`](backend/app/api/admin_api.py) — allowlist management + manual data-gathering trigger. Gated by `is_admin` (computed from `ADMIN_EMAILS`).
  - [`app/api/healthcheck_api.py`](backend/app/api/healthcheck_api.py) — liveness + scheduler status.
- Data gathering: [`app/job/data_gathering.py`](backend/app/job/data_gathering.py) (`main`, `backfill_trip_current_week`) + pluggable [`app/job/providers.py`](backend/app/job/providers.py) (`GoogleRoutesProvider`, `FixtureProvider`).
- DB layer: [`app/db/db.py`](backend/app/db/db.py) — lazy `MySQLConnectionPool` + `Database` context manager.

### Environment variables

All values have sensible local defaults (see [`backend/.env.example`](backend/.env.example)).

| Var | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `local` | `local`, `dev`, or `prod`. Legacy `DEVELOPMENT_MODE` is accepted as an alias. |
| `MYSQL_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` | `localhost` / `3306` / `root` / `Abcd1234` / `time2leave` | In prod these are overlaid by AWS Secrets Manager secret `MySecret` in `us-west-2`. The prod database name is still set explicitly via `MYSQL_DATABASE` in `backend/docker-compose.yml`. |
| `DATA_PROVIDER` | `fixture` | `google` to hit the Routes Matrix API (requires `GOOGLE_MAPS_API_KEY`). |
| `GOOGLE_MAPS_API_KEY` | _unset_ | Required for `DATA_PROVIDER=google`. |
| `GOOGLE_OAUTH_CLIENT_ID` | _unset_ | Required for the real Google sign-in. Local dev uses `ENABLE_DEV_LOGIN` instead. |
| `SESSION_SECRET` | `dev-only-change-me` | HMAC secret for session JWTs. **Always set in prod** (loaded from AWS Secrets Manager). |
| `SESSION_COOKIE_NAME` | `tlh_session` | Cookie name for the session JWT. |
| `SESSION_COOKIE_DOMAIN` | _unset_ | Set to e.g. `.larsjohansen.com` so api/frontend share cookies. |
| `SESSION_TTL_HOURS` | `168` | One week. |
| `ENABLE_DEV_LOGIN` | `true` | `POST /auth/dev-login` is mounted only when this is true. Forced off in prod. |
| `ADMIN_EMAILS` | _empty_ | Comma-separated. These users get `is_admin: true` and admin endpoints. |
| `AUTH_ALLOWLIST_BOOTSTRAP` | _empty_ | Comma-separated. Inserted into `auth_allowlist` on every startup (idempotent). |
| `MAX_TRIPS_PER_USER` / `MAX_TRIPS_TOTAL` / `MAX_WEEKLY_ROUTES_CALLS` | `3` / `150` / `150000` | Quota / cost guardrails. |
| `ALLOWED_ORIGINS` | `http://localhost:5173, http://127.0.0.1:5173, http://traffic.larsjohansen.com:5173` | Comma-separated CORS origins (outside prod). Prod always allows exactly `https://traffic.larsjohansen.com`. |
| `MYSQL_HOST_PORT` / `API_HOST_PORT` / `FRONTEND_HOST_PORT` | `3307` / `8000` / `5173` | Host-side ports published by `docker-compose.dev.yml`. MySQL defaults to `3307` so it doesn't clash with a Homebrew/system MySQL on `3306`. Override if any of these are taken on your machine. |

### Inviting people

Add their email to the allowlist via the admin API:

```bash
# requires being signed in as an ADMIN_EMAILS user; uses your browser cookie
curl -X POST https://api.time2leave.com/api/v1/admin/allowlist \
     -H 'Content-Type: application/json' \
     --cookie "tlh_session=$YOUR_SESSION_JWT" \
     -d '{"email": "friend@example.com"}'
```

Or pre-load on startup with `AUTH_ALLOWLIST_BOOTSTRAP=alice@x.com,bob@y.com`.

### Running backend alone

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
APP_ENV=local uvicorn app.main:app --reload
```

If MySQL isn't running, start just the DB:

```bash
docker compose -f backend/docker-compose.dev.yml up -d mysql
```

### Tests

```bash
make test            # unit + API (no network, no docker)
make test-integration  # docker-backed end-to-end tests (testcontainers)
make typecheck       # mypy + tsc
```

## Frontend

Location: [`frontend/`](frontend/).

- `app/routes/splash.tsx` — animated landing page for logged-out users.
- `app/routes/trips.tsx` — list of the user's trips + new-trip CTA.
- `app/routes/trips.new.tsx` — origin / destination form.
- `app/routes/trips.$tripId.tsx` — outbound/return tabs, per-day "best slot" summary strip, full heatmap, live backfill polling.
- `app/lib/session.tsx` — `<SessionProvider>` + `useSession()`. Fetches `/api/v1/me` and `/api/v1/auth/config` on mount.
- `app/lib/trips.ts` — typed API client for `/trips` endpoints + canonical 06:00–21:00 / 15-min slot generator.
- `app/components/ProtectedRoute.tsx` — redirects unauthenticated users to `/?next=…`.
- `app/components/TripHeatmap.tsx` — full grid with hue-mapped cells and a "best slot per day" summary chip strip.

### Running

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
npm run test        # vitest
npm run typecheck   # react-router typegen + tsc
npm run build       # production bundle in build/client/
```

The Google OAuth client id is fetched from the backend (`GET
/api/v1/auth/config`) so the SPA does not need its own
`VITE_GOOGLE_OAUTH_CLIENT_ID`. Frontend env vars (see
[`frontend/.env.example`](frontend/.env.example)):

| Var | Notes |
| --- | --- |
| `VITE_API_BASE_URL` | Backend base URL. Defaults to `http://localhost:8000` in dev. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional **browser-restricted** Maps JS API key used for Places autocomplete on `/trips/new`. Leave unset to get a plain text input. Must have "Maps JavaScript API" + "Places API" enabled and your dev/prod origins (e.g. `http://localhost:5173/*` and `https://traffic.larsjohansen.com/*`) in the HTTP referrer allowlist — otherwise Google returns `RefererNotAllowedMapError` at runtime and the app silently falls back to plain text entry. |

## Deployment

Frontend and backend deploy independently from **different machines**:

| Component | Runs on | Deployed from | Command |
| --- | --- | --- | --- |
| Backend (FastAPI in Docker) | EC2 | the EC2 host (SSH in first) | `cd backend && ./scripts/build-and-deploy.sh` |
| Frontend (static SPA) | S3 + CloudFront | **your local machine** | `make deploy-frontend` (from repo root) |

Do not try to build the frontend on EC2 — that host has no Node toolchain
and no AWS credentials for the S3/CloudFront resources. `deploy-to-s3.sh`
fails fast with a clear message if `npm` or `aws` is missing.

### Backend — Docker on EC2

```bash
# On the EC2 host:
cd /home/ec2-user/traffic-larsjohansen-com
git pull
cd backend
./scripts/build-and-deploy.sh
```

Uses [`backend/docker-compose.yml`](backend/docker-compose.yml) to run the
`api-traffic` container on port 8485, joined to the external `shared_network`
so it can reach the sibling `mysql` container. AWS Secrets Manager secret
`MySecret` (in `us-west-2`) supplies MySQL credentials, the Google Maps API
key, the Google OAuth client id, and `session_secret`.

#### Schema is auto-applied

At app startup, `lifespan()` runs
[`app/db/schema_bootstrap.py`](backend/app/db/schema_bootstrap.py), which
opens a connection scoped to `MYSQL_DATABASE` and executes the table
DDL from `db/init/001_schema.sql`. Every `CREATE TABLE` uses
`IF NOT EXISTS`, so the effect is:

- Brand-new (but pre-created) DB — current state, since we cut over
  from `traffic_larsjohansen_com` to `time2leave`: the app creates all
  tables on first boot.
- Existing DB: startup is a no-op beyond a handful of cheap checks.
- Adding a new table to the schema file: the next deploy creates it.
  (Column changes to existing tables still require a proper migration —
  `CREATE TABLE IF NOT EXISTS` won't `ALTER` anything.)

**Contract: the database itself must already exist.** `CREATE DATABASE`
and `USE` lines in the schema file are stripped before execution, so
the app user in AWS Secrets Manager only needs DDL on tables — not the
global `CREATE` privilege. Database creation is a one-time operator step:

- In dev, `docker-mysql` creates it from `MYSQL_DATABASE` on first
  volume init — already wired up in `docker-compose.dev.yml`.
- In prod, run `CREATE DATABASE time2leave;` once, as root.

The seed file (`002_seed.sql`) is local-dev only and is never applied
in prod.

Smoke tests after deploy:

```bash
curl https://api.time2leave.com/healthcheck
curl https://api.time2leave.com/healthcheck/scheduler
curl https://api.time2leave.com/api/v1/auth/config
```

### Frontend — S3 + CloudFront

From your **local machine** (requires Node 20+ and AWS CLI with creds for
bucket `traffic-larsjohansen-frontend` / distribution `E1XJU7E7JJA9QX`):

```bash
cd ~/code/traffic-larsjohansen-com
git pull
make deploy-frontend
```

Builds the SPA, syncs `build/client/` to `s3://traffic-larsjohansen-frontend`
(immutable cache for assets, `no-cache` for `index.html`), and invalidates
CloudFront. The script waits until the invalidation completes.

#### CloudFront one-time setup

`frontend/scripts/configure-cloudfront.sh` configures two distribution-
level things that aren't part of the per-deploy artifact pipe:

  1. **Response Headers Policy** — attaches standard SPA hardening
     headers (HSTS, nosniff, frame-options, referrer-policy) plus
     `Cross-Origin-Opener-Policy: same-origin-allow-popups`, which
     Google Sign-In needs for its popup `postMessage` callback.

  2. **CustomErrorResponses for SPA routing** — rewrites S3's `403`
     and `404` to `/index.html` with HTTP `200`, so deep links like
     `/trips` or `/trips/42` are handed to the React Router SPA
     instead of returning a static "not found" from S3.

Run once after the distribution is created, after recreating it, or
when changing any of these settings. Idempotent: re-runs only update
what drifted.

```bash
./frontend/scripts/configure-cloudfront.sh
```

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs ruff, mypy,
pytest, typecheck, vitest, and `npm run build` on every PR. Deploys remain
manual (no AWS credentials are stored in GitHub Actions).
