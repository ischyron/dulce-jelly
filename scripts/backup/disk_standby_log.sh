#!/bin/bash
set -euo pipefail

# Usage:
#   disk_standby_log.sh disk2
#   disk_standby_log.sh /dev/disk2
#
# Logs: NDJSON (JSON Lines) with fields:
#   ts_local, ts_epoch, disk, state, smartctl_rc, elapsed_ms

DISK_ARG="${1:-}"
if [[ -z "$DISK_ARG" ]]; then
  echo "Usage: $0 <diskN|/dev/diskN>" >&2
  exit 2
fi

# Normalize disk argument
if [[ "$DISK_ARG" == /dev/* ]]; then
  DISK="$DISK_ARG"
else
  DISK="/dev/$DISK_ARG"
fi
disk_name="${DISK#/dev/}"

# Resolve smartctl path (Apple Silicon Homebrew default first)
SMARTCTL="${SMARTCTL:-}"
if [[ -z "$SMARTCTL" ]]; then
  for p in /opt/homebrew/sbin/smartctl /usr/local/sbin/smartctl /usr/sbin/smartctl; do
    if [[ -x "$p" ]]; then SMARTCTL="$p"; break; fi
  done
fi
if [[ -z "${SMARTCTL}" || ! -x "${SMARTCTL}" ]]; then
  echo "ERROR: smartctl not found. Install smartmontools or set SMARTCTL=/path/to/smartctl" >&2
  exit 1
fi

# Determine a good HOME (works even if cron omits HOME; also safe under root)
USER_NAME="$(id -un)"
HOME_DIR="${HOME:-}"
if [[ -z "$HOME_DIR" || ! -d "$HOME_DIR" ]]; then
  # macOS: dscl is reliable for user home lookup
  if command -v dscl >/dev/null 2>&1; then
    HOME_DIR="$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || true)"
  fi
fi

DEFAULT_USER_LOGDIR=""
if [[ -n "$HOME_DIR" && -d "$HOME_DIR" ]]; then
  DEFAULT_USER_LOGDIR="$HOME_DIR/workspace/ducle-jelly/data/scripts/logs"
fi

# Default logdir preference: user workspace path -> /var/log -> /var/tmp
LOGDIR="${LOGDIR:-$DEFAULT_USER_LOGDIR}"
if [[ -z "$LOGDIR" ]]; then LOGDIR="/var/log/dulcejelly/scripts"; fi

mkdir -p "$LOGDIR" 2>/dev/null || {
  LOGDIR="/var/tmp/dulcejelly/scripts"
  mkdir -p "$LOGDIR"
}

LOG="$LOGDIR/disk_spindown_${disk_name}.ndjson"
LOCKDIR="$LOGDIR/.disk_spindown_${disk_name}.lockdir"

# Atomic lock via mkdir (portable on macOS)
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  exit 0
fi
cleanup() { rmdir "$LOCKDIR" 2>/dev/null || true; }
trap cleanup EXIT

now_ms() {
  if date +%s%3N >/dev/null 2>&1; then
    date +%s%3N
  else
    python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
  fi
}

t0="$(now_ms)"
ts_local="$(date "+%Y-%m-%d %H:%M:%S")"
ts_epoch="$(date +%s)"

# Key: -n standby does not spin up sleeping disk
"$SMARTCTL" -n standby "$DISK" >/dev/null 2>&1
rc=$?

t1="$(now_ms)"
elapsed_ms=$((t1 - t0))

state="ACTIVE"
if [[ $rc -eq 0 ]]; then state="REST"; fi

# NDJSON record (append one JSON object per line)
printf '{"ts_local":"%s","ts_epoch":%s,"disk":"%s","state":"%s","smartctl_rc":%s,"elapsed_ms":%s}\n' \
  "$ts_local" "$ts_epoch" "$DISK" "$state" "$rc" "$elapsed_ms" >> "$LOG"
