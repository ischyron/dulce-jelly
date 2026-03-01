#!/bin/sh
# Curatarr entrypoint — PUID/PGID support, matching the *arr ecosystem pattern.
# Sets file ownership and drops privileges before starting the app.

set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "
╔═══════════════════════════════╗
║         C U R A T A R R       ║
╚═══════════════════════════════╝
  PUID  : ${PUID}
  PGID  : ${PGID}
  DB    : ${CURATARR_DB:-/config/curatarr.db}
  Port  : ${CURATARR_PORT:-7474}
"

# ── Group ──────────────────────────────────────────────────────────
if ! getent group "${PGID}" > /dev/null 2>&1; then
  addgroup -g "${PGID}" curatarr
fi
GID_NAME=$(getent group "${PGID}" | cut -d: -f1)

# ── User ───────────────────────────────────────────────────────────
if ! getent passwd "${PUID}" > /dev/null 2>&1; then
  adduser -u "${PUID}" -G "${GID_NAME}" -s /bin/sh -D curatarr
fi

# ── Config dir ─────────────────────────────────────────────────────
DB_PATH=${CURATARR_DB:-/config/curatarr.db}
DB_DIR=$(dirname "${DB_PATH}")
mkdir -p "${DB_DIR}"
chown -R "${PUID}:${PGID}" "${DB_DIR}"

# ── Drop privileges and exec ───────────────────────────────────────
exec su-exec "${PUID}:${PGID}" "$@"
