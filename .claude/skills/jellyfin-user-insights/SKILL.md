---
name: jellyfin-user-insights
description: Generate Jellyfin playback insights for a specific username in this Dulce Jelly stack by reading the local Jellyfin SQLite databases and summarizing totals, averages, trends, active-day rate, top series, top titles, and peak watch days.
---

# Jellyfin User Insights

Use this skill when the user wants watch-time or playback-history insights for a Jellyfin user in this repo, including total hours watched, average daily usage, active-day rate, monthly or weekly trends, title breakdowns, or a report.

## Data source

- Resolve users from `data/jellyfin/config/data/jellyfin.db` table `Users`.
- Read watch history from `data/jellyfin/config/data/playback_reporting.db` table `PlaybackActivity`.
- Treat the Playback Reporting plugin database as the source of truth for duration totals.

## Workflow

1. Confirm the local Jellyfin databases exist.
2. Resolve the requested username case-insensitively in `Users`.
3. Run `python3 .claude/skills/jellyfin-user-insights/scripts/jellyfin_user_insights.py --username <name>`.
4. Answer the requested metric first, then include the covered date range in human-friendly form.
5. If the user asks for a report, save Markdown or JSON under `temp/`.

## Output expectations

- Always report:
  - matched username
  - Jellyfin user id
  - covered date range
  - total watch hours
  - active days and active-day percentage
  - average hours per calendar day
- When relevant, also report:
  - average hours per active day
  - monthly totals
  - weekly totals
  - top series
  - top titles
  - peak watch days

## Commands

Basic usage:

```sh
python3 .claude/skills/jellyfin-user-insights/scripts/jellyfin_user_insights.py --username nadia
```

Save JSON:

```sh
python3 .claude/skills/jellyfin-user-insights/scripts/jellyfin_user_insights.py --username nadia --format json > temp/nadia-insights.json
```

Save Markdown:

```sh
python3 .claude/skills/jellyfin-user-insights/scripts/jellyfin_user_insights.py --username nadia --format markdown > temp/nadia-insights.md
```

## Notes

- `PlayDuration` is treated as seconds.
- Calendar-day averages use the full inclusive span between first and last logged playback day.
- Active-day rate is `active_days / span_days`.
- If the username is ambiguous, stop and report the matching usernames instead of guessing.
