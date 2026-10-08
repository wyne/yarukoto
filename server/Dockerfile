# The web bundle and the compiled server are plain JavaScript — identical whatever
# the target CPU — so both stages pin to the *build* platform. Without this a
# multi-arch build would run Metro and tsc under QEMU emulation once per
# architecture, which is slow enough to dominate the whole build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-build
WORKDIR /repo
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY docs/package.json docs/
COPY windows/package.json windows/
COPY packages/domain packages/domain
RUN npm ci --workspace yarukoto-client --workspace @yarukoto/domain
COPY client client
RUN npm run build:domain \
    && npm exec --workspace yarukoto-client -- expo export --platform web --output-dir /web

FROM --platform=$BUILDPLATFORM node:22-alpine AS server-build
RUN apk add --no-cache python3 make g++
WORKDIR /repo
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY docs/package.json docs/
COPY windows/package.json windows/
COPY packages/domain packages/domain
RUN npm ci --workspace yarukoto-server --workspace @yarukoto/domain
COPY server server
RUN npm run build:domain \
    && npm run build --workspace yarukoto-server

FROM node:22-alpine
# wget backs the compose healthcheck; sqlite allows ad-hoc inspection without
# extra tooling on the host; su-exec lets the entrypoint drop root. python3/make/g++
# are build-only and removed again below, once better-sqlite3's native binding is
# compiled.
RUN apk add --no-cache wget sqlite su-exec python3 make g++
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY docs/package.json docs/
COPY windows/package.json windows/
COPY packages/domain/package.json packages/domain/
RUN npm ci --omit=dev --ignore-scripts --workspace yarukoto-server --workspace @yarukoto/domain \
    && npm rebuild better-sqlite3 \
    && apk del python3 make g++
COPY --from=server-build /repo/server/dist ./server/dist
COPY --from=server-build /repo/packages/domain/dist ./packages/domain/dist
COPY server/migrations ./server/migrations
COPY --from=web-build /web ./web
COPY server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Stamped into the image so /api/v1/health can say exactly which build is running.
# They land in the final stage only, so changing them doesn't bust any build cache.
ARG GIT_SHA=""
ARG BUILD_TIME=""
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Pinned rather than left to env.ts's cwd-relative default, so the web client is
# found regardless of what directory the process is started from.
ENV WEB_ROOT=/app/web
ENV DATABASE_PATH=/data/yarukoto.db

EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
