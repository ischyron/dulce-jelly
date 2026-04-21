#!/bin/sh

set -eu

MEDIA_ROOT="${MEDIA_ROOT:-/media}"
KEEPALIVE_FILE="${KEEPALIVE_FILE:-$MEDIA_ROOT/.keepalive}"
SLEEP_SECONDS="${SLEEP_SECONDS:-210}"

while true; do
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$KEEPALIVE_FILE"

  file="$(
    find "$MEDIA_ROOT" -type f \( \
      -iname '*.mkv' -o -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.avi' -o -iname '*.ts' \
    \) | head -n 1
  )"

  if [ -z "$file" ]; then
    file="$(find "$MEDIA_ROOT" -type f | head -n 1)"
  fi

  if [ -n "$file" ]; then
    head -c 65536 "$file" >/dev/null 2>&1 || true
  fi

  sleep "$SLEEP_SECONDS"
done
