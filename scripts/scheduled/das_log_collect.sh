#!/bin/sh
set -eu

WORKSPACE="$HOME/workspace/dulce-jelly"
LOG_ROOT="$WORKSPACE/data/scripts/logs/das_logs/"
mkdir -p "$LOG_ROOT"

# Rolling text log; rotate by size with simple max files
TS="$(date '+%Y-%m-%d_%H-%M-%S')"
OUT="$LOG_ROOT/das_tail_${TS}.log"

# Capture last 15 minutes, syslog style (easy to read / grep)
log show --last 15m --info --style syslog \
  --predicate 'process == "kernel" OR process == "diskarbitrationd" OR process == "diskmanagementd" OR process == "apfsd" OR process == "fsck_apfs"' \
  > "$OUT" 2>/dev/null || true

# Keep last 200 files
ls -1t "$LOG_ROOT"/das_tail_*.log 2>/dev/null | tail -n +201 | xargs -I{} rm -f "{}" 2>/dev/null || true
