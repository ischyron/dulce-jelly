#!/bin/bash
set -euo pipefail

# Usage:
#   disk_standby_log.sh /path/to/mount
# Example:
#   disk_standby_log.sh "$HOME/Media/MEDIA1"
#
# Purpose: Log filesystem access events without touching the disk.
# Method: fs_usage stream filtered by path; NDJSON per event + summary.
# Output: NDJSON with fields: ts_local, ts_epoch, path, line, type, duration_s, events

MOUNT_PATH="${1:-}"
if [[ -z "$MOUNT_PATH" ]]; then
  echo "Usage: $0 <mount_path>" >&2
  exit 2
fi

if ! command -v fs_usage >/dev/null 2>&1; then
  echo "ERROR: fs_usage not found" >&2
  exit 1
fi

WORKSPACE="$HOME/workspace/dulce-jelly"
LOGDIR="$WORKSPACE/data/scripts/logs/disk_standby/"
mkdir -p "$LOGDIR"

mount_name="$(basename "$MOUNT_PATH")"
LOG="$LOGDIR/disk_spindown_${mount_name}.ndjson"
LOCKDIR="$LOGDIR/.disk_spindown_${mount_name}.lockdir"

# Atomic lock via mkdir (portable on macOS)
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  exit 0
fi
cleanup() { rmdir "$LOCKDIR" 2>/dev/null || true; }
trap cleanup EXIT

FS_USAGE_DURATION_SEC="${FS_USAGE_DURATION_SEC:-5}"

python3 - "$MOUNT_PATH" "$FS_USAGE_DURATION_SEC" "$LOG" <<'PY'
import json
import subprocess
import sys
import time

mount_path = sys.argv[1]
duration = float(sys.argv[2])
log_path = sys.argv[3]

start = time.time()
count = 0

p = subprocess.Popen(
    ["fs_usage", "-w", "-f", "filesys"],
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
    bufsize=1,
)

try:
    while True:
        if time.time() - start >= duration:
            break
        line = p.stdout.readline()
        if not line:
            break
        if mount_path in line:
            ts = time.time()
            rec = {
                "ts_local": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)),
                "ts_epoch": int(ts),
                "path": mount_path,
                "line": line.rstrip("\n"),
                "type": "event",
            }
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
            count += 1
finally:
    try:
        p.terminate()
        p.wait(timeout=1)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass

summary = {
    "ts_local": time.strftime("%Y-%m-%d %H:%M:%S"),
    "ts_epoch": int(time.time()),
    "path": mount_path,
    "type": "summary",
    "duration_s": duration,
    "events": count,
}
with open(log_path, "a", encoding="utf-8") as f:
    f.write(json.dumps(summary) + "\n")
PY
