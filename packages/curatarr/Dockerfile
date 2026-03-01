# syntax=docker/dockerfile:1
# Build context: packages/curatarr/
#   docker build -t curatarr packages/curatarr/
#   docker build -t curatarr -f packages/curatarr/Dockerfile packages/curatarr/

# ── Stage 1: build ────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build

# Install server deps
COPY package.json ./
RUN npm install

# Install UI deps
COPY ui/package.json ui/
RUN cd ui && npm install

# Copy source and build both server (tsc) and UI (vite)
COPY src/        src/
COPY tsconfig.json ./
COPY ui/         ui/
RUN npm run build

# Prune to production deps only
RUN npm prune --omit=dev

# ── Stage 2: production ───────────────────────────────────────────
FROM node:22-alpine
LABEL org.opencontainers.image.title="Curatarr" \
      org.opencontainers.image.description="Intelligent media library manager" \
      org.opencontainers.image.source="https://github.com/your-org/dulce-jelly"

# ffprobe (for scan), su-exec (for PUID/PGID)
RUN apk add --no-cache ffmpeg su-exec

WORKDIR /app

# Built artifacts
COPY --from=builder /build/dist     ./dist
COPY --from=builder /build/dist-ui  ./dist-ui
COPY --from=builder /build/node_modules ./node_modules

# Entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ── Environment defaults ──────────────────────────────────────────
# Override any of these in docker run / compose
ENV CURATARR_DB=/config/curatarr.db
ENV CURATARR_PORT=7474
ENV CURATARR_HOST=0.0.0.0
ENV PUID=1000
ENV PGID=1000
ENV TZ=UTC

# /config  — DB + settings (mount a persistent volume here)
# /media   — read-only library path (mount your movie library here)
VOLUME /config
VOLUME /media

EXPOSE 7474

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${CURATARR_PORT}/api/stats > /dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js", "serve"]
