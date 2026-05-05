# Top-level helper targets for time2leave.
# Run `make help` for the full list.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

COMPOSE_DEV := docker compose -f backend/docker-compose.dev.yml

.DEFAULT_GOAL := help

## help: List available targets.
.PHONY: help
help:
	@grep -E '^##' $(MAKEFILE_LIST) | sed -E 's/^## ?//' | awk -F': ' '{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

## install: Install backend and web dependencies.
.PHONY: install
install: install-be install-fe

.PHONY: install-be
install-be:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

## install-fe: Install JS workspace dependencies (apps/web, apps/mobile, packages/*).
.PHONY: install-fe
install-fe:
	npm install

## dev: Start mysql + backend in docker, web on the host (two terminals recommended).
.PHONY: dev
dev: dev-be
	@echo ""
	@echo "Backend + MySQL are up. Start the web app in another terminal:"
	@echo "    make dev-fe"

## dev-be: Start mysql + backend via docker-compose.dev.yml (detached).
.PHONY: dev-be
dev-be:
	$(COMPOSE_DEV) up -d --build
	@echo "API:    http://localhost:$${API_HOST_PORT:-8000}"
	@echo "MySQL:  mysql://root:Abcd1234@localhost:$${MYSQL_HOST_PORT:-3307}/time2leave"

## dev-fe: Start the Vite dev server for apps/web on the host.
.PHONY: dev-fe
dev-fe:
	npm run dev --workspace=@time2leave/web

## dev-full: Start mysql + backend + frontend all in docker (frontend HMR over volume mount).
.PHONY: dev-full
dev-full:
	$(COMPOSE_DEV) --profile full up -d --build

## dev-ios: Full native build + install on a connected iPhone.
##          Regenerates ios/ from app.config.ts, installs pods, then
##          builds and installs the app on the device. Always-correct
##          (works for JS, native plugin, and entitlement changes
##          alike) at the cost of being slower than `dev-ios-start`.
##          Override the target device with IOS_DEVICE='My Other iPhone'.
.PHONY: dev-ios
dev-ios:
	cd apps/mobile && npx expo prebuild --platform ios
	cd apps/mobile/ios && pod install
	cd apps/mobile && npx expo run:ios --device "$${IOS_DEVICE:-Lars Kristians iPhone}"

## dev-ios-start: Start the Expo dev server for the mobile app.
##                The dev build already on your phone connects to it
##                over Wi-Fi; save a JS file and the app fast-refreshes.
##                No rebuild required — use this for everyday JS work.
.PHONY: dev-ios-start
dev-ios-start:
	cd apps/mobile && npx expo start --dev-client

## seed: Refresh next-week samples for every active trip via the running backend.
##       Requires you've signed in once at http://localhost:5173 as an admin.
.PHONY: seed
seed:
	@if [ -z "$$ADMIN_SESSION_COOKIE" ]; then \
		echo "Set ADMIN_SESSION_COOKIE='tlh_session=...' (copy from your browser devtools > Application > Cookies)"; \
		exit 1; \
	fi
	curl -fsS -X POST http://localhost:$${API_HOST_PORT:-8000}/api/v1/admin/run-data-gathering \
		-H "Cookie: $$ADMIN_SESSION_COOKIE"
	@echo ""

## seed-cli: Refresh next-week samples by running the Python data-gathering job directly.
##           Skips auth entirely; useful in CI / first-boot scenarios.
.PHONY: seed-cli
seed-cli:
	cd backend && . .venv/bin/activate && APP_ENV=local MYSQL_HOST=127.0.0.1 MYSQL_PORT=$${MYSQL_HOST_PORT:-3307} python -m scripts.seed_local

## logs: Tail docker-compose logs.
.PHONY: logs
logs:
	$(COMPOSE_DEV) logs -f --tail=200

## down: Stop the dev stack (preserves MySQL volume).
.PHONY: down
down:
	$(COMPOSE_DEV) down

## clean: Stop the dev stack and wipe the MySQL volume.
.PHONY: clean
clean:
	$(COMPOSE_DEV) down -v

## test: Run backend + frontend unit/api tests (no integration).
.PHONY: test
test: test-be test-fe

.PHONY: test-be
test-be:
	cd backend && . .venv/bin/activate && pytest

.PHONY: test-fe
test-fe:
	npm run test --workspace=@time2leave/shared
	npm run test --workspace=@time2leave/web

## test-integration: Run docker-backed backend integration tests.
.PHONY: test-integration
test-integration:
	cd backend && . .venv/bin/activate && pytest -m integration

## check: Lint, typecheck and run all tests.
.PHONY: check
check: lint typecheck test

.PHONY: lint
lint:
	cd backend && . .venv/bin/activate && ruff check app tests

.PHONY: format
format:
	cd backend && . .venv/bin/activate && ruff format app tests && ruff check --fix app tests

.PHONY: typecheck
typecheck:
	cd backend && . .venv/bin/activate && mypy app tests
	npm run typecheck --workspace=@time2leave/shared
	npm run typecheck --workspace=@time2leave/web

## deploy-frontend: Build the web SPA and push to S3 + invalidate CloudFront.
.PHONY: deploy-frontend
deploy-frontend:
	cd apps/web && ./scripts/deploy-to-s3.sh

## regenerate-seed: Regenerate backend/db/init/002_seed.sql from the fixture generator.
.PHONY: regenerate-seed
regenerate-seed:
	cd backend && python3 db/init/_generate_seed.py
