# The web bundle and the compiled server are plain JavaScript — identical whatever
# the target CPU — so both stages pin to the *build* platform. Without this a
# multi-arch build would run Metro and tsc under QEMU emulation once per
# architecture, which is slow enough to dominate the whole build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web-build
WORKDIR /repo
COPY mobile/package*.json mobile/
RUN cd mobile && npm ci
COPY shared shared
COPY mobile mobile
RUN cd mobile && npx expo export --platform web --output-dir /web

FROM --platform=$BUILDPLATFORM node:22-alpine AS server-build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci
COPY shared shared
COPY server server
RUN cd server && npm run build

FROM node:22-alpine
# wget backs the compose healthcheck; sqlite makes `.backup` and ad-hoc inspection
# possible without extra tooling on the host. python3/make/g++ are build-only and
# removed again below, once better-sqlite3's native binding is compiled.
RUN apk add --no-cache wget sqlite python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3 && apk del python3 make g++
COPY --from=server-build /app/server/dist ./dist
COPY server/migrations ./migrations
COPY --from=web-build /web ../web

# Pinned rather than left to env.ts's cwd-relative default, so the web client is
# found regardless of what directory the process is started from.
ENV WEB_ROOT=/app/web
ENV DATABASE_PATH=/data/yarukoto.db

EXPOSE 8080
CMD ["node", "dist/server/src/index.js"]
