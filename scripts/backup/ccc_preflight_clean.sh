#!/bin/bash
# Data Backup Preflight cleaner (macOS / CCC / manual)
# Deletes junk sidecar files before backup.
#
# Exit codes:
#   0 = success (including "nothing matched")
#   1 = bad input / unsafe root / not a directory / operational failure (find/delete)
#
# Logging:
#   <LOG_DIR>/<script-name>.<uid>.log (from .env, or ./logs/ by default)
#   - CCC (root) writes to uid 0 log
#   - Manual runs write to your uid log

# ----------------------------
# CONFIG: patterns to delete (EDIT HERE)
# ----------------------------
# Notes:
# - Patterns are matched case-insensitively via `find -iname`, except .DS_Store
# - These are filename globs (not regex)
# - `.com` patterns are *literal* and will NOT match words like "complete"

DELETE_PATTERNS=(
  # --- YTS sidecar junk ---
  "*yts*.jpg"
  "*yts*.jpeg"
  "*yts*.txt"

  # --- proxy junk ---
  "*proxy*.txt"

  # --- .com tracker junk (LITERAL .com only) ---
  "*.com.jpg"
  "*.com.jpeg"
  "*.com.txt"

  # --- partial downloads ---
  "*.part"

  # --- macOS metadata ---
  ".DS_Store"

  # --- macOS AppleDouble sidecars ---
  "._*"
)

# Max size (in K) for matched junk files (safety cap)
MAX_SIZE_K=1024

# ----------------------------
# SCRIPT SETUP (do not edit below unless needed)
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

ts() { /bin/date "+%Y-%m-%d %H:%M:%S"; }
log() {
  local msg="$(ts) $*"
  echo "$msg" | /usr/bin/tee -a "$LOG_FILE" 2>/dev/null || echo "$msg"
}

ROOT="${1:-}"

log "-----"
log "START root='$ROOT' user='$(/usr/bin/id -un 2>/dev/null)' uid='$(/usr/bin/id -u 2>/dev/null)' euid='$(/usr/bin/id -u 2>/dev/null)'"
log "SCRIPT_DIR='${SCRIPT_DIR}'"
if [[ "${ENV_LOADED}" -eq 1 ]]; then
  log "INFO: .env file loaded from '${ENV_FILE}'"
else
  log "WARNING: .env file not found at '${ENV_FILE}', using defaults"
fi
log "LOG_FILE='$LOG_FILE'"

# ---------- hard failures ----------
if [[ -z "$ROOT" ]]; then
  log "ERROR: no root argument supplied"
  exit 1
fi

# Warn if not running with elevated privileges (but don't fail - let operations fail naturally if permissions insufficient)
if [[ "$(/usr/bin/id -u)" -ne 0 ]]; then
  log "WARNING: not running as root (uid=$(/usr/bin/id -u)). May encounter permission errors."
fi

[[ "$ROOT" != "/" ]] && ROOT="${ROOT%/}"

# Refuse to operate on broad/system locations
case "$ROOT" in
  "/"|"/System"*|"/Volumes"|"/Users"|"/private"*|"/var"*|"/etc"*|"/bin"*|"/sbin"*|"/usr"*)
    log "ERROR: unsafe root '$ROOT'"
    exit 1
    ;;
esac

if [[ ! -d "$ROOT" ]]; then
  log "ERROR: root is not a directory or not accessible: '$ROOT'"
  exit 1
fi

# ----------------------------
# Build find expression from patterns (safe, no eval)
# ----------------------------
FIND_EXPR=( -type f "(" )
first=1

for pat in "${DELETE_PATTERNS[@]}"; do
  if [[ $first -eq 0 ]]; then
    FIND_EXPR+=( -o )
  else
    first=0
  fi

  if [[ "$pat" == ".DS_Store" ]]; then
    FIND_EXPR+=( -name "$pat" )
  else
    FIND_EXPR+=( -iname "$pat" )
  fi
done

FIND_EXPR+=( ")" -size -${MAX_SIZE_K}k )

# ---------- count ----------
COUNT=$( /usr/bin/find "$ROOT" "${FIND_EXPR[@]}" -print 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ' ) || {
  log "ERROR: find failed during count under '$ROOT'"
  exit 1
}

log "MATCHED count=$COUNT"

# ---------- samples ----------
if [[ "$COUNT" -gt 0 ]]; then
  log "SAMPLES (up to 15):"
  /usr/bin/find "$ROOT" "${FIND_EXPR[@]}" -print 2>/dev/null | /usr/bin/head -n 15 | while IFS= read -r f; do
    log "  $f"
  done
fi

# ---------- cleanup ----------
if [[ "$COUNT" -gt 0 ]]; then
  # Clear immutable flags (prevents 'Operation not permitted' on macOS)
  /usr/bin/find "$ROOT" "${FIND_EXPR[@]}" -print0 2>/dev/null \
    | /usr/bin/xargs -0 /usr/bin/chflags -h nouchg 2>/dev/null || true

  # Delete
  /usr/bin/find "$ROOT" "${FIND_EXPR[@]}" -delete 2>/dev/null || {
    log "ERROR: delete failed under '$ROOT'"
    exit 1
  }

  # Post-count (verification)
LEFT=$( /usr/bin/find "$ROOT" "${FIND_EXPR[@]}" -print 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ' ) || {
    log "ERROR: find failed during post-count under '$ROOT'"
    exit 1
  }

  log "DELETED approx=$COUNT remaining=$LEFT"
else
  log "INFO: nothing to delete"
fi

log "SUCCESS"
exit 0
