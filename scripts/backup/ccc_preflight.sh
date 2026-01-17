#!/bin/bash
# CCC Preflight Master Script (macOS)
# Single entry point for Carbon Copy Cloner preflight checks.
# Orchestrates mount and cleanup operations before backup begins.
#
# Usage: ccc_preflight.sh <backup_root>
#   backup_root = the directory to be backed up (e.g., /Volumes/MEDIA1)
#
# Exit codes:
#   0 = all preflight checks passed
#   1 = one or more preflight checks failed
#
# Logging:
#   <LOG_DIR>/<script-name>.<uid>.log (from .env, or ./logs/ by default)
#   Individual scripts also write their own logs

set -e
set -u
set -o pipefail

# ----------------------------
# CONFIG
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

# Default log directory if not set in .env
LOG_DIR="${LOG_DIR:-${SCRIPT_DIR}/logs}"
LOG_FILE="${LOG_DIR}/${SAFE_SCRIPT_NAME}.$(/usr/bin/id -u).log"

MOUNT_SCRIPT="${SCRIPT_DIR}/ccc_preflight_mount.sh"
CLEAN_SCRIPT="${SCRIPT_DIR}/ccc_preflight_clean.sh"

# ----------------------------
# LOGGING
# ----------------------------
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
# VALIDATION
# ----------------------------
BACKUP_ROOT="${1:-}"

log "====="
log "START CCC Preflight Master user='$(/usr/bin/id -un 2>/dev/null)' uid='$(/usr/bin/id -u 2>/dev/null)'"
log "SCRIPT_DIR='${SCRIPT_DIR}'"
if [[ "${ENV_LOADED}" -eq 1 ]]; then
  log "INFO: .env file loaded from '${ENV_FILE}'"
else
  log "WARNING: .env file not found at '${ENV_FILE}', using defaults"
fi
log "LOG_FILE='$LOG_FILE'"
log "BACKUP_ROOT='$BACKUP_ROOT'"

# CCC runs preflight scripts with elevated privileges automatically
# These scripts will warn/fail gracefully if permissions are insufficient
if [[ "$(/usr/bin/id -u)" -ne 0 ]]; then
  log "INFO: running as non-root user (uid=$(/usr/bin/id -u)). CCC typically runs with elevated privileges."
fi

if [[ -z "$BACKUP_ROOT" ]]; then
  fail "no backup root argument supplied"
fi

if [[ ! -d "$BACKUP_ROOT" ]]; then
  fail "backup root is not a directory or not accessible: '$BACKUP_ROOT'"
fi

if [[ ! -x "$MOUNT_SCRIPT" ]]; then
  fail "mount script not found or not executable: '$MOUNT_SCRIPT'"
fi

if [[ ! -x "$CLEAN_SCRIPT" ]]; then
  fail "clean script not found or not executable: '$CLEAN_SCRIPT'"
fi

# ----------------------------
# STEP 1: Ensure backup destination is mounted
# ----------------------------
log "STEP 1: Running mount preflight: $MOUNT_SCRIPT"
if "$MOUNT_SCRIPT"; then
  log "STEP 1: PASS - mount check successful"
else
  EXIT_CODE=$?
  fail "mount preflight failed with exit code $EXIT_CODE"
fi

# ----------------------------
# STEP 2: Clean junk files from backup root
# ----------------------------
log "STEP 2: Running cleanup preflight: $CLEAN_SCRIPT $BACKUP_ROOT"
if "$CLEAN_SCRIPT" "$BACKUP_ROOT"; then
  log "STEP 2: PASS - cleanup successful"
else
  EXIT_CODE=$?
  fail "cleanup preflight failed with exit code $EXIT_CODE"
fi

# ----------------------------
# ALL CHECKS PASSED
# ----------------------------
log "ALL PREFLIGHT CHECKS PASSED"
log "SUCCESS"
log "====="
exit 0
