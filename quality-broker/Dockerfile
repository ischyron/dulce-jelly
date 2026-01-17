FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY .eslintrc.cjs .
COPY src ./src
COPY config ./config
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config

# Create entrypoint script that handles both cron mode and direct execution
RUN printf '%s\n' \
'#!/bin/sh' \
'set -e' \
'' \
'# If arguments provided, run them directly (for ms qb-run and docker exec)' \
'if [ "$#" -gt 0 ]; then' \
'  exec "$@"' \
'fi' \
'' \
'# Otherwise, set up cron (daemon mode)' \
'SCHEDULE="${CRON_SCHEDULE:-0 0 * * *}"' \
'echo "Quality Broker starting with schedule: $SCHEDULE"' \
'' \
'# Create cron job with proper logging' \
'echo "$SCHEDULE cd /app && node dist/index.js run 2>&1" > /etc/crontabs/root' \
'' \
'# Start cron in foreground' \
'exec crond -f -l 2' \
> /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
