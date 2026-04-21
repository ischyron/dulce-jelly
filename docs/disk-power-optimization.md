# Seagate IronWolf  NAS drive EPC / Power Management Optimization


## Problem 
The issue was not “a power-management setting is theoretically suboptimal.” The issue surfaced as a **practical drive-behavior problem**:

- SMART data suggested the heads were **parking/unloading too aggressively**
- the default behavior looked optimized for a workload that is **not** how this library drive is used
- for a **home media drive**, that means unnecessary mechanical transitions during ordinary quiet gaps rather than genuinely long idle periods

In plain terms: the drive appeared too eager to “rest” after short inactivity windows.

### Hypothesis behind the default behavior

A plausible explanation is that the stock **Idle_B = 2 minutes** default is a design choice that also suits **surveillance / NVR-style usage**:

- motion detected → burst write
- short idle gap
- motion detected again → burst write
- repeat across many cameras / many drives

In that kind of environment, typical inter-event gaps can be around **2–5 minutes**, so unloading heads at the first reasonable chance can reduce power draw across many disks in a rack.

That may be sensible for surveillance-style duty.

> **This is not the use for a home media drive.**

A home media drive behind a Mac mini + Docker media stack is different:

- background daemons may touch metadata or poll occasionally
- there can be many short idle gaps that are not true “rest for a long time” periods
- the drive should not behave as though every 2-minute lull is a good time to park heads aggressively

So the optimization goal here was user-centered:

- reduce unnecessary parking / unloading during routine daemon noise
- still allow deeper idle later
- still allow full spin-down for genuinely long inactivity

### Fixing 

On Seagate IronWolf drives in the TerraMaster USB DAS, the expected legacy APM route did not apply cleanly:

- `hdparm -B` / legacy APM was effectively the wrong control surface for this drive class.
- SMART reported **`APM feature is: Unavailable`** on the ST16000VN001-2YU101 drive.
- The drives instead exposed **EPC (Extended Power Conditions)**, which Seagate brands as **PowerChoice**.
- The default EPC timers were aggressive for a home media-server pattern:
  - **Idle B** default: `1200` = **2 minutes**
  - **Idle C** default: `6000` = **10 minutes**
  - **Standby Z** default: `9000` = **15 minutes**
- That is a poor fit for a Mac mini + Docker + media stack where background daemons create short bursts of activity and brief quiet gaps. The result is unnecessary unload / re-idle transitions.

There was also confusion during testing because older guidance referenced a `--save` flag, but on the installed toolchain that flag was not valid.

## Baseline SMART counters at time of change

These values should be treated as the **baseline snapshot** taken around the time the new EPC settings were applied. They are useful for future comparison to see how head-load / cycle-related counters evolve over time after this change.

### `sda`
Sources:
- `bin/smart-reports/smart_sda_short_21-Apr-2026_1723.txt`
- `bin/smart-reports/smart_sda_status_21-Apr-2026_1725.txt`

Baseline values:
- **Start_Stop_Count** = `11914`
- **Power_Cycle_Count** = `11937`
- **Load_Cycle_Count** = `21507`
- **Hardware Resets** = `264`

### `sdb`
Sources:
- `bin/smart-reports/smart_sdb_short_21-Apr-2026_1723.txt`
- `bin/smart-reports/smart_sdb_status_21-Apr-2026_1725.txt`

Baseline values:
- **Start_Stop_Count** = `11792`
- **Power_Cycle_Count** = `11821`
- **Load_Cycle_Count** = `16494`
- **Hardware Resets** = `32`

### Why this baseline matters

The point of recording these numbers is not only historical bookkeeping. It gives a before/after reference for whether this EPC tuning actually improves behavior in practice.

The main counters to watch over time are:

- **Load_Cycle_Count** → whether aggressive head unload / reload behavior slows down
- **Start_Stop_Count** → whether full start/stop events remain reasonable
- **Power_Cycle_Count** → useful context, especially if enclosure/USB behavior changes
- **Hardware Resets** → helps distinguish drive behavior from DAS / USB / bridge-path instability

If the optimization is working as intended, the hope is that **load-cycle growth becomes less aggressive** relative to normal usage.

## Environment / tool details

- Host test environment: **Ubuntu Server LTS in VMware Fusion**
- Tool upgraded from an older SeaTools/openSeaChest package to:
  - **`openSeaChest_PowerControl Version: 26.03.0 ARM64`**
  - Build date: **Mar 6 2026**
- Drive model observed:
  - **Seagate IronWolf ST16000VN001-2YU101**
  - Firmware: **SN02**

## What we verified

### 1) APM was not the right mechanism

SMART output showed:

- `APM feature is: Unavailable`

That is the key reason not to treat this like a normal `hdparm -B` tuning exercise.

### 2) EPC was the active mechanism

`openSeaChest_PowerControl --showEPCSettings` showed the EPC states directly:

- Idle A
- Idle B
- Idle C
- Standby Z

The tool output also states:

- `All times are in 100 milliseconds`

That means the display values are **not milliseconds**. They are **0.1 second units**.

Examples:

| Raw value shown | Human meaning |
|---:|---|
| `1200` | 120 seconds = 2 minutes |
| `6000` | 600 seconds = 10 minutes |
| `9000` | 900 seconds = 15 minutes |
| `18000` | 1800 seconds = 30 minutes |
| `27000` | 2700 seconds = 45 minutes |
| `72000` | 7200 seconds = 2 hours |

### 3) `--save` was not required on v26

In **openSeaChest 26.03**, the help text says the EPC state setters are **non-volatile by default**:

- `--idle_b`
- `--idle_c`
- `--standby_z`

The help explicitly states that these settings are non-volatile, and `--volatile` is only needed if a temporary setting is desired.

So on this version:

- **Do not use `--save`**
- **Do not use `--volatile`** unless temporary behavior is intended

### 4) Persistence was proven after real power loss

After applying the new EPC timers, the DAS was physically powered off and the drives were unplugged/re-plugged. After that, `--showEPCSettings` still showed:

- `Idle B = 18000`
- `Idle C = 27000`
- `Standby Z = 72000`

for **both** drives, in both **Current Timer** and **Saved Timer**.

That is the practical proof that the settings persisted across a real power loss on this DAS path.

## Chosen policy / fix

### Rationale

The chosen timer policy was:

- **Idle B = 30 minutes**
  - goal: ignore background daemon chatter and avoid nuisance unloads
- **Idle C = 45 minutes**
  - goal: move to a deeper idle state only after a more meaningful quiet period
- **Standby Z = 2 hours**
  - goal: allow full spin-down only for genuinely long inactive periods

### Commands used

The setters take **milliseconds** on input.

So the intended timings are:

- 30 minutes = **1,800,000 ms**
- 45 minutes = **2,700,000 ms**
- 2 hours = **7,200,000 ms**

Commands:

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

Expected post-change values in the EPC table:

- **Idle B**: `18000`
- **Idle C**: `27000`
- **Standby Z**: `72000`

## Suggested shell script

```bash
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
```

## Final resulting configuration

After the fix, both drives showed:

| State | Raw value | Human meaning |
|---|---:|---|
| Idle B | `18000` | 30 minutes |
| Idle C | `27000` | 45 minutes |
| Standby Z | `72000` | 2 hours |

Defaults for comparison:

| State | Default raw | Default human |
|---|---:|---|
| Idle B | `1200` | 2 minutes |
| Idle C | `6000` | 10 minutes |
| Standby Z | `9000` | 15 minutes |

## Trade-offs / caveats

This approach is reasonable, but it is not free of trade-offs.

### Benefits

- Far fewer nuisance unload / reload transitions
- Better fit for a home media server with light but frequent background touches
- Less tendency to park aggressively during short idle gaps
- Still allows deeper idle and eventual full spin-down

### Trade-offs

- The drives stay active longer before entering lower-power states
- Slightly higher idle power consumption than stock defaults
- Slightly more heat during quiet periods compared with aggressive factory timers
- Spindown now happens later, so very long idle periods save less power than default until the 2-hour mark is reached

### Operational caveats

- `Idle C` should be described as a **deeper idle / lower power state**, not “reduced RPM” in a simplistic sense.
- `Standby Z` is the actual **full spin-down** state.
- Any EPC changes should be verified after a real power cycle, not only in the current session.
- Low-level SAT / EPC operations over **USB DAS + UAS + VM pass-through** can produce bridge resets during experimentation.

## Observation during testing

During testing, kernel logs showed a **USB/UAS reset** on one drive:

- `uas_eh_abort_handler`
- `uas_eh_device_reset_handler start`
- `usb 3-1: reset SuperSpeed Plus Gen 2x1 USB device number 6 using xhci_hcd`
- `uas_eh_device_reset_handler success`

Interpretation:

- this looked like a **USB / UAS bridge reset path issue during low-level command experimentation**
- it did **not** by itself prove drive failure
- the VM + USB pass-through + DAS bridge path is the first thing to suspect before blaming the disk

So for normal operation, the key question is whether such resets continue during ordinary use. A one-off reset during low-level experimentation is not enough evidence to call the disk bad.



## Additional perspective: 2-minute default versus long-term wear window

From a user perspective, one reason the stock **2-minute Idle_B** feels too aggressive is that, if a drive were actually allowed to hit that timer repeatedly over long periods, the transition count accumulates very quickly.

This does **not** prove Seagate intentionally tuned it to “expire at warranty.” That would be speculation. But it does show why a 2-minute unload-oriented policy can look optimized around a more typical warranty-era duty pattern rather than a gentler long-life home-media pattern where the same drives may be expected to remain healthy well beyond 5 years.

### Simple upper-bound math

Assume the drive really reaches the Idle_B timer repeatedly whenever it gets a qualifying idle gap.

#### At a 2-minute timer

- 1 event every 2 minutes
- **30 events/hour**
- **720 events/day**
- **262,800 events/year**
- **1,314,000 events over 5 years**

#### At a 30-minute timer

- 1 event every 30 minutes
- **2 events/hour**
- **48 events/day**
- **17,520 events/year**
- **87,600 events over 5 years**

### Ratio

A **2-minute** timer allows up to:

- **15× more transitions** than a **30-minute** timer

because:

- 30 minutes / 2 minutes = **15**

### What this means in practice

This is a worst-case thought experiment, not a prediction.

Real workloads are messy:

- the drive will not hit the timer perfectly around the clock
- some idle gaps will be shorter
- some will be longer
- host polling, metadata touches, enclosure behavior, and media activity all distort the pattern

So these numbers are best read as a **pressure indicator**, not as literal expected counts.

Still, the direction is useful:

- a **2-minute** policy creates the opportunity for **far more unload/transition activity**
- a **30-minute** policy dramatically reduces how often the drive even has the chance to perform those transitions during ordinary light-idle periods

### Why this matters for this setup

For a surveillance / NVR style workload, frequent short idle windows may make a short timer defensible.

For a home media library drive, that same policy is much easier to read as over-eager:

- many short quiet gaps are not true “rest the mechanics now” periods
- they are just normal pauses between small background touches
- a longer timer better matches the user goal: **let the drive stay settled unless inactivity is genuinely meaningful**

### Summary table

| Timer policy | Max transition opportunities per hour | Per day | Per year | Over 5 years |
|---|---:|---:|---:|---:|
| **2 min** | 30 | 720 | 262,800 | 1,314,000 |
| **30 min** | 2 | 48 | 17,520 | 87,600 |

The practical takeaway is not that the drive was guaranteed to wear out at warranty. The practical takeaway is that **the stock 2-minute behavior can create a much harsher transition pattern than needed for this home-media use case**, while the **30-minute** setting is a much more conservative long-life compromise.

## Reference links

- openSeaChest PowerControl v26 help / manual:
  - https://manpages.debian.org/unstable/openseachest/openSeaChest_PowerControl.8.en.html
- Seagate openSeaChest discussion on persistent EPC behavior:
  - https://github.com/Seagate/openSeaChest/discussions/146
- Earlier discussion that led to confusion around `--save`:
  - https://github.com/Seagate/openSeaChest/discussions/82

## Short conclusion

The fix was to stop treating these IronWolf drives like legacy-APM disks and instead tune their EPC / PowerChoice timers directly with `openSeaChest_PowerControl` v26.

Final effective settings per drive:

- **Idle B: 30 minutes**
- **Idle C: 45 minutes**
- **Standby Z: 2 hours**

These values were verified in `--showEPCSettings` and survived a real physical power-off and re-plug of the DAS, confirming persistence.
