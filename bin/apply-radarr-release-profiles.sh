#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${1:-$ROOT_DIR/data/recyclarr/config/configs/radarr-release-profiles.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not found" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env file not found: $ENV_FILE" >&2
  exit 1
fi

radarr_api_key="$(awk -F= '/^RADARR_API_KEY=/{print $2}' "$ENV_FILE")"
radarr_port="$(awk -F= '/^RADARR_PORT=/{print $2}' "$ENV_FILE")"

if [[ -z "${radarr_api_key:-}" || -z "${radarr_port:-}" ]]; then
  echo "RADARR_API_KEY or RADARR_PORT missing in $ENV_FILE" >&2
  exit 1
fi

base_url="http://localhost:${radarr_port}/api/v3"

existing_json="$(curl -fsS "${base_url}/releaseprofile?apikey=${radarr_api_key}")"

profile_count="$(jq '.profiles | length' "$CONFIG_FILE")"
if [[ "$profile_count" -eq 0 ]]; then
  echo "No profiles in $CONFIG_FILE"
  exit 0
fi

for i in $(seq 0 $((profile_count - 1))); do
  profile="$(jq -c ".profiles[$i]" "$CONFIG_FILE")"
  name="$(jq -r '.name' <<<"$profile")"

  if [[ -z "$name" || "$name" == "null" ]]; then
    echo "Skipping profile index $i with empty name" >&2
    continue
  fi

  payload="$(jq -c '{
    name: .name,
    enabled: (.enabled // true),
    required: (.required // []),
    ignored: (.ignored // []),
    indexerId: (.indexerId // 0),
    tags: (.tags // [])
  }' <<<"$profile")"

  existing_id="$(jq -r --arg n "$name" '.[] | select(.name == $n) | .id' <<<"$existing_json" | head -n1)"

  if [[ -n "${existing_id:-}" ]]; then
    put_payload="$(jq -c --argjson id "$existing_id" '. + {id: $id}' <<<"$payload")"
    curl -fsS -X PUT \
      "${base_url}/releaseprofile/${existing_id}?apikey=${radarr_api_key}" \
      -H "Content-Type: application/json" \
      --data "$put_payload" >/dev/null
    echo "Updated release profile: $name (id=$existing_id)"
  else
    curl -fsS -X POST \
      "${base_url}/releaseprofile?apikey=${radarr_api_key}" \
      -H "Content-Type: application/json" \
      --data "$payload" >/dev/null
    echo "Created release profile: $name"
  fi
done
