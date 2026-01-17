#!/bin/bash
# CCC Pre-run script (macOS)
# Ensures volume "media2" is mounted at /Volumes/media2.
# - Attempts mount once (by UUID if provided, else by name)
# - Waits up to MAX_WAIT_SEC for spin-up/mount to appear
# - Does NOT do any write tests or create files on the disk
#
# Exit codes:
#   0 = mounted (or already mounted)
#   1 = failed / timed out / unsafe config
#
# Logging:
#   <LOG_DIR>/<script-name>.<uid>.log (from .env, or ./logs/ by default)
#   - CCC (root) writes to uid 0 log
#   - Manual runs write to your uid log

set -u  # (avoid -e: we intentionally tolerate diskutil nonzero while polling)
set -o pipefail

# ----------------------------
# SCRIPT SETUP
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$(/usr/bin/basename "$0")"
SAFE_SCRIPT_NAME="$(echo "$SCRIPT_NAME" | /usr/bin/tr -cd 'A-Za-z0-9._-')"

# Load .env file from script directory (CCC doesn't pass env vars, so we read from file)
ENV_FILE="${SCRIPT_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
  ENV_LOADED=1
else
  ENV_LOADED=0
fi

# ----------------------------
# CONFIG (from .env with defaults)
# ----------------------------
VOL_NAME="${VOL_NAME:-MEDIA2}"
MOUNT_POINT="/Volumes/${VOL_NAME}"
VOLUME_UUID="${VOLUME_UUID:-}"
MIN_WAIT_SEC="${MIN_WAIT_SEC:-13}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-60}"
POLL_SEC="${POLL_SEC:-1}"

# ----------------------------
# LOGGING
# ----------------------------
LOG_DIR="${LOG_DIR:-${SCRIPT_DIR}/logs}"
LOG_FILE="${LOG_DIR}/${SAFE_SCRIPT_NAME}.$(/usr/bin/id -u).log"

ts() { /bin/date "+%Y-%m-%d %H:%M:%S"; }
log() {
  local msg="$(ts) $*"
  echo "$msg" | /usr/bin/tee -a "$LOG_FILE" 2>/dev/null || echo "$msg"
}

fail() {
  local msg="$(ts) ERROR: $*"
  echo "$msg" | /usr/bin/tee -a "$LOG_FILE" >&2 2>/dev/null || echo "$msg" >&2
  exit 1
}

# ----------------------------
# SAFETY CHECKS
# ----------------------------
[[ -n "${VOL_NAME}" ]] || fail "VOL_NAME is empty"
[[ "${MOUNT_POINT}" == /Volumes/* ]] || fail "Unsafe MOUNT_POINT: ${MOUNT_POINT}"
[[ "${MIN_WAIT_SEC}" -ge 0 ]] || fail "MIN_WAIT_SEC must be >= 0"
[[ "${MAX_WAIT_SEC}" -ge "${MIN_WAIT_SEC}" ]] || fail "MAX_WAIT_SEC must be >= MIN_WAIT_SEC"
[[ "${POLL_SEC}" -ge 1 ]] || fail "POLL_SEC must be >= 1"

is_mounted() {
  /sbin/mount | /usr/bin/grep -Fq " on ${MOUNT_POINT} "
}

# ----------------------------
# MAIN
# ----------------------------
log "-----"
log "START mount_point='${MOUNT_POINT}' user='$(/usr/bin/id -un 2>/dev/null)' uid='$(/usr/bin/id -u 2>/dev/null)'"
log "SCRIPT_DIR='${SCRIPT_DIR}'"
if [[ "${ENV_LOADED}" -eq 1 ]]; then
  log "INFO: .env file loaded from '${ENV_FILE}'"
else
  log "WARNING: .env file not found at '${ENV_FILE}', using defaults"
fi
log "LOG_FILE='$LOG_FILE'"

# Note: diskutil mount typically works for regular users on macOS
# CCC will run this with elevated privileges automatically
if [[ "$(/usr/bin/id -u)" -ne 0 ]]; then
  log "INFO: running as non-root user (uid=$(/usr/bin/id -u)). diskutil should still work."
fi

if is_mounted; then
  log "INFO: already mounted: ${MOUNT_POINT}"
  log "SUCCESS"
  exit 0
fi

log "INFO: not mounted, initiating mount via diskutil"
if [[ -n "${VOLUME_UUID}" ]]; then
  log "INFO: mounting by UUID: ${VOLUME_UUID}"
  /usr/sbin/diskutil mount "${VOLUME_UUID}" >/dev/null 2>&1 || true
else
  log "INFO: mounting by name: ${VOL_NAME}"
  /usr/sbin/diskutil mount "${VOL_NAME}" >/dev/null 2>&1 || true
fi

start_epoch=$(/bin/date +%s)

while true; do
  if is_mounted; then
    elapsed=$(( $(/bin/date +%s) - start_epoch ))
    log "MOUNTED: ${MOUNT_POINT} after ${elapsed}s"
    log "SUCCESS"
    exit 0
  fi

  now_epoch=$(/bin/date +%s)
  elapsed=$((now_epoch - start_epoch))

  # Don't fail before MIN_WAIT_SEC; after that, keep waiting until MAX_WAIT_SEC.
  if [[ "${elapsed}" -ge "${MAX_WAIT_SEC}" ]]; then
    fail "timed out after ${elapsed}s waiting for mount: ${MOUNT_POINT}"
  fi

  /bin/sleep "${POLL_SEC}"
done