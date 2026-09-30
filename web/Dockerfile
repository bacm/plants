# The Expo web build, served by Caddy (ticket 097). Build context is the repo
# root: docker build -f web/Dockerfile .
#
# Stage 1 builds the static site. Node 22 matches CI.
FROM node:22-slim AS build
WORKDIR /app

# Dependencies first, so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# Only what the bundle needs; .dockerignore drops the rest.
COPY app.json babel.config.js ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY assets ./assets

# Metro inlines EXPO_PUBLIC_* into the bundle at build time, so this is baked
# in. It is a public URL, never a secret (CLAUDE.md rule 2).
ARG EXPO_PUBLIC_PLANT_API_URL
ENV EXPO_PUBLIC_PLANT_API_URL=$EXPO_PUBLIC_PLANT_API_URL
RUN npx expo export --platform web --output-dir dist

# Stage 2: only the static files and a small web server, no Node.
FROM caddy:2-alpine
COPY web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# The stock image runs as root; nothing here needs it (port 8080 is above
# 1024 and, with the Caddyfile's `admin off` and `auto_https off`, Caddy
# writes no state outside /config and /data, which it may create for the
# user below).
RUN adduser -D -u 10001 web && mkdir -p /config /data && chown -R web /config /data
USER web

EXPOSE 8080
