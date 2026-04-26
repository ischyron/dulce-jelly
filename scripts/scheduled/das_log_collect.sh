#!/bin/sh
set -eu

WORKSPACE="$HOME/workspace/dulce-jelly"
LOG_ROOT="$WORKSPACE/data/scripts/logs/das_logs/"
mkdir -p "$LOG_ROOT"

# Rolling text log; rotate by size with simple max files
TS="$(date '+%Y-%m-%d_%H-%M-%S')"
OUT="$LOG_ROOT/das_tail_${TS}.log"

# Capture recent storage, disk arbitration, and USB/enclosure events.
# Include attach/detach style messages so bridge re-enumeration is visible.
log show --last 15m --info --style syslog \
  --predicate 'process == "kernel" OR process == "diskarbitrationd" OR process == "diskmanagementd" OR process == "apfsd" OR process == "fsck_apfs" OR eventMessage CONTAINS[c] "USB" OR eventMessage CONTAINS[c] "IOUSB" OR eventMessage CONTAINS[c] "IOUSBHost" OR eventMessage CONTAINS[c] "attach" OR eventMessage CONTAINS[c] "detach" OR eventMessage CONTAINS[c] "eject" OR eventMessage CONTAINS[c] "terminated" OR eventMessage CONTAINS[c] "matched" OR eventMessage CONTAINS[c] "mounted" OR eventMessage CONTAINS[c] "unmounted"' \
  > "$OUT" 2>/dev/null || true

# Keep last 200 files
ls -1t "$LOG_ROOT"/das_tail_*.log 2>/dev/null | tail -n +201 | xargs -I{} rm -f "{}" 2>/dev/null || true
