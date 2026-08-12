FROM node:22-alpine AS web-build
WORKDIR /repo
COPY mobile/package*.json mobile/
RUN cd mobile && npm ci
COPY shared shared
COPY mobile mobile
RUN cd mobile && npx expo export --platform web --output-dir /web

FROM node:22-alpine AS server-build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci
COPY shared shared
COPY server server
RUN cd server && npm run build

FROM node:22-alpine
RUN apk add --no-cache wget python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3 && apk del python3 make g++
COPY --from=server-build /app/server/dist ./dist
COPY server/migrations ./migrations
COPY --from=web-build /web ../web

ENV DATABASE_PATH=/data/yarukoto.db

EXPOSE 8080
CMD ["node", "dist/server/src/index.js"]
