#!/usr/bin/env bash
set -euo pipefail

for d in /dev/sg1 /dev/sg2; do
  echo "===== $d ====="
  sudo openSeaChest_PowerControl -d "$d" --showEPCSettings
done

# active/idle state
# sudo openSeaChest_PowerControl -d /dev/sg1 --checkPowerMode
# sudo openSeaChest_PowerControl -d /dev/sg2 --checkPowerMode