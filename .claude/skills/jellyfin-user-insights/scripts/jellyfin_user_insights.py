#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
JELLYFIN_DB = ROOT / "data/jellyfin/config/data/jellyfin.db"
PLAYBACK_DB = ROOT / "data/jellyfin/config/data/playback_reporting.db"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Jellyfin playback insights for one user.")
    parser.add_argument("--username", required=True, help="Jellyfin username to inspect")
    parser.add_argument("--format", choices=("text", "json", "markdown"), default="text")
    parser.add_argument("--top", type=int, default=10, help="Top N series and titles to include")
    return parser.parse_args()


def fmt_day(day: str) -> str:
    return datetime.strptime(day, "%Y-%m-%d").strftime("%B %d, %Y")


def get_user(username: str) -> dict[str, str]:
    with sqlite3.connect(JELLYFIN_DB) as conn:
        conn.row_factory = sqlite3.Row
        exact = conn.execute(
            "SELECT Id, Username FROM Users WHERE lower(Username) = lower(?)",
            (username,),
        ).fetchone()
        if exact:
            return {"id": exact["Id"], "username": exact["Username"]}

        partials = list(
            conn.execute(
                "SELECT Id, Username FROM Users WHERE lower(Username) LIKE '%' || lower(?) || '%' ORDER BY Username",
                (username,),
            )
        )
        if not partials:
            raise SystemExit(f'No Jellyfin user matched "{username}".')
        if len(partials) > 1:
            names = ", ".join(row["Username"] for row in partials)
            raise SystemExit(f'Ambiguous username "{username}". Matches: {names}')
        row = partials[0]
        return {"id": row["Id"], "username": row["Username"]}


def rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    conn.row_factory = sqlite3.Row
    return [dict(row) for row in conn.execute(sql, params)]


def fetch_insights(user_id: str, top_n: int) -> dict:
    playback_user_id = user_id.replace("-", "").lower()
    with sqlite3.connect(PLAYBACK_DB) as conn:
        conn.row_factory = sqlite3.Row
        summary = conn.execute(
            """
            WITH stats AS (
              SELECT
                SUM(PlayDuration) / 3600.0 AS total_hours,
                MIN(date(DateCreated)) AS start_day,
                MAX(date(DateCreated)) AS end_day,
                julianday(MAX(date(DateCreated))) - julianday(MIN(date(DateCreated))) + 1 AS span_days,
                COUNT(DISTINCT date(DateCreated)) AS active_days,
                COUNT(*) AS plays
              FROM PlaybackActivity
              WHERE lower(UserId) = ?
            )
            SELECT
              ROUND(total_hours, 2) AS total_hours,
              start_day,
              end_day,
              CAST(span_days AS INTEGER) AS span_days,
              active_days,
              plays,
              ROUND(total_hours / span_days, 2) AS avg_hours_per_calendar_day,
              ROUND(total_hours / active_days, 2) AS avg_hours_per_active_day
            FROM stats
            """,
            (playback_user_id,),
        ).fetchone()

        if not summary or summary["plays"] in (None, 0):
            raise SystemExit("No playback rows were found for that user in playback_reporting.db.")

        result = {
            "summary": {
                **dict(summary),
                "active_day_percentage": round((summary["active_days"] / summary["span_days"]) * 100, 1),
                "start_day_human": fmt_day(summary["start_day"]),
                "end_day_human": fmt_day(summary["end_day"]),
            },
            "by_type": rows(
                conn,
                """
                SELECT ItemType, COUNT(*) AS plays, ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                GROUP BY ItemType
                ORDER BY SUM(PlayDuration) DESC
                """,
                (playback_user_id,),
            ),
            "monthly": rows(
                conn,
                """
                SELECT strftime('%Y-%m', DateCreated) AS month, ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                GROUP BY month
                ORDER BY month
                """,
                (playback_user_id,),
            ),
            "weekly": rows(
                conn,
                """
                SELECT strftime('%Y-W%W', DateCreated) AS week, ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                GROUP BY week
                ORDER BY week
                """,
                (playback_user_id,),
            ),
            "top_series": rows(
                conn,
                """
                SELECT
                  substr(ItemName, 1, instr(ItemName, ' - s') - 1) AS series,
                  ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours,
                  COUNT(*) AS plays
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                  AND ItemType = 'Episode'
                  AND instr(ItemName, ' - s') > 0
                GROUP BY series
                ORDER BY SUM(PlayDuration) DESC
                LIMIT ?
                """,
                (playback_user_id, top_n),
            ),
            "top_titles": rows(
                conn,
                """
                SELECT ItemName, ItemType, ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours, COUNT(*) AS plays
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                GROUP BY ItemName, ItemType
                ORDER BY SUM(PlayDuration) DESC
                LIMIT ?
                """,
                (playback_user_id, top_n),
            ),
            "peak_days": rows(
                conn,
                """
                SELECT date(DateCreated) AS day, ROUND(SUM(PlayDuration) / 3600.0, 2) AS hours
                FROM PlaybackActivity
                WHERE lower(UserId) = ?
                GROUP BY day
                ORDER BY SUM(PlayDuration) DESC
                LIMIT 5
                """,
                (playback_user_id,),
            ),
        }
        for row in result["peak_days"]:
            row["day_human"] = fmt_day(row["day"])
        return result


def render_text(username: str, user_id: str, data: dict) -> str:
    s = data["summary"]
    lines = [
        f"User: {username}",
        f"Jellyfin user id: {user_id}",
        f"Date range: {s['start_day_human']} to {s['end_day_human']}",
        f"Total watch time: {s['total_hours']:.2f} hours",
        f"Playback rows: {s['plays']}",
        f"Active days: {s['active_days']} of {s['span_days']} ({s['active_day_percentage']:.1f}%)",
        f"Average per calendar day: {s['avg_hours_per_calendar_day']:.2f} hours",
        f"Average per active day: {s['avg_hours_per_active_day']:.2f} hours",
    ]
    return "\n".join(lines)


def render_markdown(username: str, user_id: str, data: dict) -> str:
    s = data["summary"]
    out = [
        f"# Jellyfin Insights for {username}",
        "",
        f"- Jellyfin user id: `{user_id}`",
        f"- Date range: **{s['start_day_human']}** to **{s['end_day_human']}**",
        f"- Total watch time: **{s['total_hours']:.2f} hours**",
        f"- Playback rows: **{s['plays']}**",
        f"- Active days: **{s['active_days']} of {s['span_days']}** ({s['active_day_percentage']:.1f}%)",
        f"- Average per calendar day: **{s['avg_hours_per_calendar_day']:.2f} hours**",
        f"- Average per active day: **{s['avg_hours_per_active_day']:.2f} hours**",
        "",
        "## By Content Type",
        "",
        "| Type | Hours | Plays |",
        "| --- | ---: | ---: |",
    ]
    out.extend(f"| {row['ItemType']} | {row['hours']:.2f} | {row['plays']} |" for row in data["by_type"])
    out.extend(["", "## Top Series", "", "| Series | Hours | Plays |", "| --- | ---: | ---: |"])
    out.extend(f"| {row['series']} | {row['hours']:.2f} | {row['plays']} |" for row in data["top_series"])
    out.extend(["", "## Top Titles", "", "| Title | Type | Hours | Plays |", "| --- | --- | ---: | ---: |"])
    out.extend(
        f"| {row['ItemName']} | {row['ItemType']} | {row['hours']:.2f} | {row['plays']} |"
        for row in data["top_titles"]
    )
    return "\n".join(out)


def main() -> None:
    args = parse_args()
    if not JELLYFIN_DB.exists():
        raise SystemExit(f"Missing Jellyfin users database: {JELLYFIN_DB}")
    if not PLAYBACK_DB.exists():
        raise SystemExit(f"Missing playback reporting database: {PLAYBACK_DB}")

    user = get_user(args.username)
    data = fetch_insights(user["id"], args.top)

    if args.format == "json":
        print(json.dumps({"username": user["username"], "user_id": user["id"], **data}, indent=2))
    elif args.format == "markdown":
        print(render_markdown(user["username"], user["id"], data))
    else:
        print(render_text(user["username"], user["id"], data))


if __name__ == "__main__":
    main()
