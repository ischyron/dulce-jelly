#!/usr/bin/env bash
set -euo pipefail

for d in /dev/sg1 /dev/sg2; do
  sudo openSeaChest_PowerControl -d "$d" --idle_b 1800000
  sudo openSeaChest_PowerControl -d "$d" --idle_c 2700000
  sudo openSeaChest_PowerControl -d "$d" --standby_z 7200000
done

for d in /dev/sg1 /dev/sg2; do
  echo "===== $d ====="
  sudo openSeaChest_PowerControl -d "$d" --showEPCSettings
done