# Seagate IronWolf EPC / Power Optimization

## Problem
The drives were visibly cycling too often for a home media workload:

- SMART showed aggressive head load/unload and power-cycle growth
- stock timers were behaving as if short quiet gaps were good times to unload or spin down
- that is a poor fit for a Mac mini + Docker media stack because the drive can park aggressively, then spin up again soon after, creating unnecessary mechanical wear

In plain terms: the drives were too eager to "rest" after short idle gaps.

Why this is a real problem even under low usage:

- this is a mostly idle home media setup, not a high-throughput workload
- `sda` reached about `21,507` load cycles in roughly `67` days
- these Seagate IronWolf NAS drives are rated for about `600,000` load/unload cycles
- `21,507 / 600,000`, so that is already about **3.6%** of the nominal load/unload budget
- `21,507 / 67 ≈ 321` load cycles/day
- at that pace, `600,000 / 321 ≈ 1,869` days, or about **5.1 years**
- that matters because a 5-year horizon is also the rough upper bound people often use when thinking about long-term HDD service life, even though regular IronWolf warranty is shorter than that

The concern is not that brief touches exist. The concern is that the drive was parking too aggressively and then spinning back up again soon afterward. For a low-usage home media disk, that is the wrong kind of wear to accumulate.


## Troubleshooting
Mounted-volume polling on macOS was real. Running:

```bash
sudo fs_usage -w -f filesys | grep "$HOME/Media/MEDIA1"
```

showed background metadata access from real macOS processes such as:
- `Finder`
- `lsd`
- `appstoreagent`

A practical finding was that Finder visibility itself mattered: a sidebar link or similar mounted-volume presence was enough to trigger metadata checks on `MEDIA1`.

These were lightweight calls such as `getattrlist`, `stat64`, `statfs64`, and `getxattr`. They were enough to wake the disk, but not enough to keep it awake. The drive would still park or spin down soon afterward, which points back to the firmware / EPC idle policy as the real problem.

## Keepalive test result
A dedicated keepalive loop was also tested via [scripts/scheduled/disk_keepalive.sh](../scripts/scheduled/disk_keepalive.sh). It updated a visible timestamp file and performed a small periodic read every `3.5` minutes, so it worked mechanically.

It did **not** materially solve the problem. The disks still parked or cycled too aggressively, which means the read-based keepalive was not enough to override the underlying idle policy. There was a small effect, but not a decisive one: it appeared to reduce the cycle rate somewhat in short windows, yet the drives were still transitioning far too often for the workaround to be considered a real fix.


## Why APM was the wrong path
These drives do not expose useful legacy APM control:

- SMART reported `APM feature is: Unavailable`
- the active power-management mechanism was **EPC (Extended Power Conditions)**, which Seagate brands as **PowerChoice**

Relevant helper scripts:
- [bin/install-openseachest.sh](../bin/install-openseachest.sh)
- [bin/set-disk-apm.sh](../bin/set-disk-apm.sh)
- [bin/get-disk-apm.sh](../bin/get-disk-apm.sh)
- [bin/openseachest--help.txt](../bin/openseachest--help.txt)
- [bin/run-smart.sh](../bin/run-smart.sh)

## Environment
- Host test environment: Ubuntu Server LTS in VMware Fusion
- Tool version: `openSeaChest_PowerControl 26.03.0 ARM64`
- Drive model: `Seagate IronWolf ST16000VN001-2YU101`
- Firmware: `SN02`

## Default EPC timers
`openSeaChest_PowerControl --showEPCSettings` reports EPC times in **100 ms units**.

Defaults observed:

| State | Raw | Human |
|---|---:|---|
| Idle B | `1200` | 2 minutes |
| Idle C | `6000` | 10 minutes |
| Standby Z | `9000` | 15 minutes |

For this workload, those defaults were too aggressive.

## Chosen policy
New timers:

| State | Raw | Human |
|---|---:|---|
| Idle B | `18000` | 30 minutes |
| Idle C | `27000` | 45 minutes |
| Standby Z | `72000` | 2 hours |

Rationale:
- `Idle B 30m`: ignore daemon chatter and brief metadata noise
- `Idle C 45m`: allow deeper idle only after a meaningful quiet period
- `Standby Z 2h`: allow full spin-down only for truly long inactivity

Commands used:

```bash
sudo openSeaChest_PowerControl -d /dev/sg1 --idle_b 1800000
sudo openSeaChest_PowerControl -d /dev/sg1 --idle_c 2700000
sudo openSeaChest_PowerControl -d /dev/sg1 --standby_z 7200000

sudo openSeaChest_PowerControl -d /dev/sg2 --idle_b 1800000
sudo openSeaChest_PowerControl -d /dev/sg2 --idle_c 2700000
sudo openSeaChest_PowerControl -d /dev/sg2 --standby_z 7200000
```

Verification:

```bash
sudo openSeaChest_PowerControl -d /dev/sg1 --showEPCSettings
sudo openSeaChest_PowerControl -d /dev/sg2 --showEPCSettings
```

The script version is in [bin/set-disk-apm.sh](../bin/set-disk-apm.sh). The readback helper is [bin/get-disk-apm.sh](../bin/get-disk-apm.sh).

## Persistence
On this tool version, EPC setters are non-volatile by default. `--save` was not needed.

This was confirmed practically:
- DAS was powered off
- drives were unplugged and re-plugged
- `--showEPCSettings` still showed the new timers in both current and saved values

So the settings persisted in drive firmware, not just in the session.

## SMART baseline at time of change
These are the before/after comparison anchors after the EPC change was applied and persistence was confirmed.

### `sda`
Sources:
- `bin/smart-reports/smart_sda_short_21-Apr-2026_1723.txt`
- `bin/smart-reports/smart_sda_status_21-Apr-2026_1725.txt`

Baseline values:
- `Start_Stop_Count = 11914`
- `Power_Cycle_Count = 11937`
- `Load_Cycle_Count = 21507`
- `Hardware Resets = 264`

### `sdb`
Sources:
- `bin/smart-reports/smart_sdb_short_21-Apr-2026_1723.txt`
- `bin/smart-reports/smart_sdb_status_21-Apr-2026_1725.txt`

Baseline values:
- `Start_Stop_Count = 11792`
- `Power_Cycle_Count = 11821`
- `Load_Cycle_Count = 16494`
- `Hardware Resets = 32`

Main counters to watch over time:
- `Load_Cycle_Count`: whether unload/reload behavior slows down
- `Start_Stop_Count`: whether full start/stop events stay reasonable
- `Power_Cycle_Count`: whether broader stop/start churn slows down
- `Hardware Resets`: whether the DAS / USB path remains stable

## HDD life impact
This IronWolf model is commonly rated around **600,000 load/unload cycles**. The point is not to predict failure exactly, but to show why short timers matter.

Approximate head-load consumption at the recorded baseline:
- `sda`: `21,507 / 600,000` ≈ **3.6%** of rating used
- `sdb`: `16,494 / 600,000` ≈ **2.7%** of rating used

A short timer creates transition opportunities very quickly:

| Timer policy | Max opportunities / hour | Per day | Per year | Over 5 years |
|---|---:|---:|---:|---:|
| 2 min | 30 | 720 | 262,800 | 1,314,000 |
| 30 min | 2 | 48 | 17,520 | 87,600 |

That is a **15x** difference in maximum transition opportunity. Real workloads are messier than this, but the direction is the important part: `30m` is a much gentler policy than `2m`.


## Caveats
- `Idle C` is a deeper idle state, not a simple "reduced RPM" description
- `Standby Z` is the actual full spin-down state
- low-level SAT / EPC work over USB DAS + UAS + VM pass-through can cause bridge resets during experimentation
- a one-off USB/UAS reset during testing is not enough evidence to call the disk bad

## Short conclusion
The fix was to stop treating these drives like legacy-APM disks and tune their EPC / PowerChoice timers directly.

Final effective settings:
- `Idle B = 30 minutes`
- `Idle C = 45 minutes`
- `Standby Z = 2 hours`

These values were verified through `--showEPCSettings` and persisted across a real physical power-off and re-plug of the DAS.

## References
- openSeaChest PowerControl manual:
  https://manpages.debian.org/unstable/openseachest/openSeaChest_PowerControl.8.en.html
- Seagate discussion on persistent EPC behavior:
  https://github.com/Seagate/openSeaChest/discussions/146
- Earlier discussion that caused `--save` confusion:
  https://github.com/Seagate/openSeaChest/discussions/82
