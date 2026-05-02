# Multi-stage build for the web SPA inside the npm workspaces monorepo.
#
# Build context is expected to be the *repo root*, e.g.:
#   docker build -f apps/web/Dockerfile -t time2leave-web .
#
# Workspaces require the root package.json + lockfile alongside every
# workspace it references, so we copy the whole tree before installing.

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN npm run build --workspace=@time2leave/web

FROM node:20-alpine AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /repo/apps/web
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/web/node_modules /repo/apps/web/node_modules
COPY --from=build /repo/apps/web/build ./build
COPY apps/web/package.json ./package.json
COPY packages/shared /repo/packages/shared
CMD ["npm", "run", "start"]
