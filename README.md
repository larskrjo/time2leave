# traffic.larsjohansen.com

Commute-time heatmap between home (San Jose) and work (San Francisco).

- **Backend** — FastAPI + MySQL + APScheduler. Weekly job samples Google's
  Routes Matrix API and stores medians in MySQL; the API serves a pivoted
  heatmap payload to the frontend.
- **Frontend** — React Router 7 SPA (SSR disabled) with MUI and Nivo's
  heatmap, deployed to S3 + CloudFront.

## Quickstart

```bash
make install      # set up backend venv + frontend node_modules
make dev-be       # mysql + api in docker (seed data applied automatically)
make dev-fe       # frontend on http://localhost:5173
```

Open http://localhost:5173. No AWS credentials, Google Maps API key, or
`/etc/hosts` edits required — the fixture data is seeded on first boot.

Run `make help` for all targets (`test`, `lint`, `typecheck`, `logs`,
`seed`, `clean`, `deploy-frontend`, …).

## Architecture

```
APScheduler (Fri 23:00 PT, prod only)
    ↓
CommuteProvider (Google Routes Matrix  |  FixtureProvider)
    ↓
MySQL  commute_slots  (date_local, departure_time_rfc3339, direction, duration, …)
    ↓
FastAPI  /api/v1/commute/heatmap
    ↓
React SPA (CloudFront → S3 in prod, Vite dev server locally)
```

## Backend

Location: [`backend/`](backend/).

- Entry point: [`app/main.py`](backend/app/main.py) (`create_app()` factory).
- Configuration: [`app/config.py`](backend/app/config.py) — typed
  `Settings` via `pydantic-settings`. In prod, secrets are loaded lazily
  from AWS Secrets Manager; everywhere else, defaults + env vars.
- Routers:
  - [`app/api/traffic_api.py`](backend/app/api/traffic_api.py) — public heatmap endpoints.
  - [`app/api/healthcheck_api.py`](backend/app/api/healthcheck_api.py) — liveness + scheduler status.
  - [`app/api/admin_api.py`](backend/app/api/admin_api.py) — `POST /api/v1/admin/run-data-gathering` (only mounted when `APP_ENV != prod`).
- Data gathering: [`app/job/data_gathering.py`](backend/app/job/data_gathering.py) + pluggable [`app/job/providers.py`](backend/app/job/providers.py) (`GoogleRoutesProvider`, `FixtureProvider`).
- DB layer: [`app/db/db.py`](backend/app/db/db.py) — lazy `MySQLConnectionPool` singleton + `Database` context manager.

### Environment variables

All values have sensible local defaults (see [`backend/.env.example`](backend/.env.example)).

| Var | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `local` | `local`, `dev`, or `prod`. Legacy `DEVELOPMENT_MODE` is accepted as an alias. |
| `MYSQL_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` | `localhost` / `3306` / `root` / `Abcd1234` / `traffic_larsjohansen_com` | In prod these are overlaid by AWS Secrets Manager secret `MySecret` in `us-west-2`. |
| `DATA_PROVIDER` | `fixture` | `google` to hit the Routes Matrix API (requires `GOOGLE_MAPS_API_KEY`). |
| `GOOGLE_MAPS_API_KEY` | _unset_ | Required for `DATA_PROVIDER=google`. |
| `ENABLE_ADMIN_API` | `true` | Mount the admin router. Forced off in prod regardless. |
| `MYSQL_HOST_PORT` / `API_HOST_PORT` / `FRONTEND_HOST_PORT` | `3307` / `8000` / `5173` | Host-side ports published by `docker-compose.dev.yml`. MySQL defaults to `3307` so it doesn't clash with a Homebrew/system MySQL on `3306`. Override if any of these are taken on your machine. |

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
make lint            # ruff
make typecheck       # mypy + tsc
```

## Frontend

Location: [`frontend/`](frontend/).

- `app/routes/index.tsx` — clientLoader fetches the heatmap JSON and passes it to `<HeatMap />`.
- `app/components/HeatMap.tsx` — Nivo `ResponsiveHeatMap` with weekday tabs and cell tooltips.
- `app/constants/path.ts` — API base URL resolved from `VITE_API_BASE_URL`, defaulting to `http://localhost:8000` in dev.

### Running

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
npm run test        # vitest
npm run typecheck   # react-router typegen + tsc
npm run build       # production bundle in build/client/
```

## Deployment (unchanged from before)

The frontend and backend deploy independently, from **different machines**:

| Component | Runs on | Deployed from | Command |
| --- | --- | --- | --- |
| Backend (FastAPI in Docker) | EC2 | the EC2 host (SSH in first) | `cd backend && ./scripts/build-and-deploy.sh` |
| Frontend (static SPA) | S3 + CloudFront | **your local machine** | `make deploy-frontend` (from repo root) |

Do not try to build the frontend on EC2 — that host has no Node toolchain and
no AWS credentials for the S3/CloudFront resources. `deploy-to-s3.sh` now
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
`MySecret` (in `us-west-2`) supplies MySQL credentials and the Google
Maps API key.

Smoke tests after deploy:

```bash
curl https://api.traffic.larsjohansen.com/healthcheck
curl https://api.traffic.larsjohansen.com/healthcheck/scheduler
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

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs ruff, mypy,
pytest, typecheck, vitest, and `npm run build` on every PR. Deploys remain
manual (no AWS credentials are stored in GitHub Actions).
