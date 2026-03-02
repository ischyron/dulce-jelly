#!/usr/bin/env bash
# Curatarr local CI/CD pipeline runner
# Usage:
#   ./pipeline.sh              — run all stages
#   ./pipeline.sh build-server — run a single named stage
#   ./pipeline.sh --list       — list stages
#
# Reads stages from pipeline.yml in the same directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PIPELINE_YML="$SCRIPT_DIR/pipeline.yml"

# ── Colours ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
  C_GREEN='\033[32m'; C_RED='\033[31m'; C_YELLOW='\033[33m'
  C_CYAN='\033[36m'; C_VIOLET='\033[35m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_RED=''
  C_YELLOW=''; C_CYAN=''; C_VIOLET=''
fi

log()  { echo -e "${C_DIM}[pipeline]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}${C_BOLD}✓${C_RESET} $*"; }
fail() { echo -e "${C_RED}${C_BOLD}✗${C_RESET} $*" >&2; }
info() { echo -e "${C_CYAN}${C_BOLD}▶${C_RESET} $*"; }
head() { echo -e "\n${C_VIOLET}${C_BOLD}━━ $* ━━${C_RESET}"; }

# ── Parse pipeline.yml with Python stdlib ─────────────────────────────
# Outputs tab-separated lines: name\tcmd\tworkdir\tdesc
parse_stages() {
  python3 - "$PIPELINE_YML" <<'PYEOF'
import sys, re

lines = open(sys.argv[1]).readlines()

# Walk line-by-line; collect stage blocks starting at "  - name:"
stages = []
current = None
in_stages = False

for line in lines:
    stripped = line.rstrip()
    # Detect top-level "stages:" key
    if re.match(r'^stages:\s*$', stripped):
        in_stages = True
        continue
    # Detect another top-level key ending the stages block
    if in_stages and re.match(r'^\S', stripped) and stripped and not stripped.startswith('#'):
        in_stages = False

    if not in_stages:
        continue

    # New stage entry
    m = re.match(r'^  - name:\s+(.+)', stripped)
    if m:
        if current:
            stages.append(current)
        current = {'name': m.group(1).strip(), 'cmd': '', 'workdir': '.', 'desc': ''}
        continue

    if current is None:
        continue

    # Stage fields (indented under the entry)
    for key in ('cmd', 'workdir', 'desc'):
        m = re.match(rf'^\s+{key}:\s+(.+)', stripped)
        if m:
            current[key] = m.group(1).strip()

if current:
    stages.append(current)

for s in stages:
    if s['name'] and s['cmd']:
        print(f"{s['name']}\t{s['cmd']}\t{s['workdir']}\t{s['desc']}")
PYEOF
}

# ── Load stages into arrays ───────────────────────────────────────────
declare -a STAGE_NAMES STAGE_CMDS STAGE_WORKDIRS STAGE_DESCS

while IFS=$'\t' read -r name cmd workdir desc; do
  STAGE_NAMES+=("$name")
  STAGE_CMDS+=("$cmd")
  STAGE_WORKDIRS+=("$workdir")
  STAGE_DESCS+=("$desc")
done < <(parse_stages)

if [[ ${#STAGE_NAMES[@]} -eq 0 ]]; then
  fail "No stages found in $PIPELINE_YML"
  exit 1
fi

# ── --list flag ───────────────────────────────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  echo ""
  echo -e "${C_BOLD}Stages in pipeline.yml:${C_RESET}"
  for i in "${!STAGE_NAMES[@]}"; do
    printf "  ${C_CYAN}%-18s${C_RESET} %s\n" "${STAGE_NAMES[$i]}" "${STAGE_DESCS[$i]:-${STAGE_CMDS[$i]}}"
  done
  echo ""
  exit 0
fi

# ── Run a single named stage ──────────────────────────────────────────
run_one_stage() {
  local target="$1"
  for i in "${!STAGE_NAMES[@]}"; do
    if [[ "${STAGE_NAMES[$i]}" == "$target" ]]; then
      run_stage "$i"
      return 0
    fi
  done
  fail "Stage not found: $target"
  echo -e "  Available: ${STAGE_NAMES[*]}"
  exit 1
}

run_stage() {
  local i=$1
  local name="${STAGE_NAMES[$i]}"
  local cmd="${STAGE_CMDS[$i]}"
  local workdir="${STAGE_WORKDIRS[$i]}"
  local desc="${STAGE_DESCS[$i]:-$cmd}"
  local abs_workdir="$REPO_ROOT/$workdir"

  info "[$name] $desc"
  log "  cd $workdir && $cmd"

  local start_ts; start_ts=$(date +%s)
  if (cd "$abs_workdir" && eval "$cmd"); then
    local elapsed=$(( $(date +%s) - start_ts ))
    ok "[$name] done in ${elapsed}s"
  else
    local elapsed=$(( $(date +%s) - start_ts ))
    fail "[$name] FAILED after ${elapsed}s"
    return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────
TARGET="${1:-}"

if [[ -n "$TARGET" && "$TARGET" != "--"* ]]; then
  head "curatarr pipeline — stage: $TARGET"
  run_one_stage "$TARGET"
  echo ""
  exit 0
fi

# Run all stages
head "curatarr pipeline — $(date '+%Y-%m-%d %H:%M:%S')"
log "Pipeline: $PIPELINE_YML"
log "Repo root: $REPO_ROOT"
echo ""

FAILED=0
for i in "${!STAGE_NAMES[@]}"; do
  run_stage "$i" || { FAILED=1; break; }
  echo ""
done

if [[ $FAILED -eq 0 ]]; then
  echo -e "${C_GREEN}${C_BOLD}Pipeline complete.${C_RESET} All stages passed."
else
  echo -e "${C_RED}${C_BOLD}Pipeline failed.${C_RESET} See above." >&2
  exit 1
fi
