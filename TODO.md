# Agent's TODO

### Ground rules
- Always read the todo from disk as human would keep this updated and so latest status and feedback on tasks is important
- Always read the TODO from disk, as the human keeps this updated and the latest status and feedback on tasks are important.
- Work through todos independently; pause only if human review is required.
- Strike out when done/blocked.
- Don't create new sections for TODOs or bugs. Keep status inline.
- Process to mark a TODO  as DONE or closure of any work item.
  - develop feature/fix with all edge cases considred
  - unit/interaction test if any need to commit
  - run e2e test 
  - commit and push changed to git.
  - deploy it on docker
  - Then mark as complete or done
  - Follow up questions if any edge cases left unhanlded due to lack of requirement clarity

### Curatarr Backlog

- [DONE] ~~Integrate TrashGuide as a dedicated section for Custom Format Scores, syncing directly from the TrashGuide. Users should not edit these scores for now. Investigate how Radarr handles edits to Recyclarr-synced Custom Format scores—specifically, what occurs if a user modifies a TrashGuide-synced Custom Format in Radarr. Ensure our implementation matches this behavior for consistency.~~
  - Implemented:
    - Add parity read path against Radarr CF assignments and compare with Curatarr TRaSH snapshot.
    - Persist parity status in settings keys:
      - `scoutTrashParityState` (`in_sync|drifted|unknown`)
      - `scoutTrashParityCheckedAt`
      - `scoutTrashParityDiffJson`
    - Add `GET /api/scout/trash-parity` and Settings UI panel showing drift details read-only.
    - Define explicit conflict behavior in UI: user-edited Radarr values are shown as drift; Curatarr does not silently overwrite unless user runs explicit re-sync.
    - Tests: API coverage for `in_sync`, `drifted`, and no-radarr-config paths.

- [DONE] ~~Implement a Custom Format Scores UI that allows users to add a string label and a numeric score. Filenames should be matched using either a provided regular expression or a string pattern. Example regex: \bDD[P+](?!A)|\b(e[-_. ]?ac-?3)\b. Ensure the UI supports entry and editing of pattern/score pairs, and that matching logic works for both regex and simple string inputs.~~
  - Implemented:
    - Data model via rules table category `scout_custom_cf` config schema:
      - `{ matchType: 'regex'|'string', pattern: string, score: number, flags?: 'i', appliesTo?: 'title'|'full', notes?: string }`
    - Server validation for save/update:
      - Reject invalid regex with clear error.
      - Clamp score range to existing CF range policy.
    - Scoring pipeline integration:
      - Evaluate all enabled custom CF rules in `scoreRelease`.
      - Append match reasons (`custom_cf:<rule_name>`) for observability.
      - Enforce deterministic order: TRaSH baseline -> built-in CF -> custom overrides.
    - UI in Settings > Scout:
      - Add/edit/delete rows, regex/string toggle, preview input with live match result.
    - Tests:
      - Unit/API tests for regex/string matching.
      - E2E test validating custom rule impacts Scout result scoring/reasons.

- [DONE] ~~Redesign the Rules Config assistant. The current implementation is incorrect. This UI should allow users to input natural language rules as plain sentences and arrange them in order of priority (1 to N). It is not a pre-configuration tool as previously implemented. Clarify that this functionality is meant for advanced use cases—specifically, for handling tie-breakers or extending logic beyond deterministic scoring when additional edge cases must be covered without relying solely on custom scores.~~
  - Implemented:
    - Replace helper-only flow with explicit ordered sentence list editor:
      - row schema `{ id, enabled, priority, sentence }`, strict 1..N order.
      - move up/down or drag reorder, save order stable.
    - Persist as rules category `scout_llm_ruleset` through `/api/rules`.
    - Build execution contract for Scout output:
      - Input = deterministic top candidates + ordered rules.
      - Output sections = `final_choices[]` and `dropped_releases[]` with reason strings.
      - LLM stage only post-deterministic (drop weak candidates + tie-break close scores).
    - UI:
      - Add `Dropped Releases` section in Scout results with reason and score context.
    - Tests:
      - API test for ordered persistence and prompt assembly.
      - E2E test for reorder persistence + dropped section visibility.


### Other Todo Items/Issues 
- [BLOCKED] qBittorrent lockout of IP from accessing.
  - Gating: must retain qBittorrent WebUI security protections; no weakening that compromises exposure over internet (keep host/referrer safeguards effective while making config persistent).
  - Access paths: LAN `http://localhost:3275` or `http://<server-ip>:3275` (or `http://media.local:3275`); public `http://qb.mymedialibrary.example` behind Caddy basic auth; `http://media.local/qb` issues 307 → `:3275`; Cloudflare tunnel via `https://qb.mymedialibrary.example`.
  - Behavior: initial WebUI config (currently HostHeaderValidation=false, LocalHostAuth=false, subnet whitelist on) saves using temporary password from logs, but any later manual changes are lost after container restart; `qBittorrent.conf` looks regenerated and WebUI can return unauthorized without showing login.
  - Log warnings (from `data/qbittorrent/config/qBittorrent/logs/qbittorrent.log`): repeated `WebUI: Invalid Host header, port mismatch ... Received Host header: 'localhost:3275'` and `WebUI: Referer header & Target origin mismatch ... Referer header: 'https://mymedialibrary.example/' ... Target origin: 'qb.mymedialibrary.example'` around restarts.
  - Suspected causes: (1) qBittorrent may be unable to persist later edits because files under `data/qbittorrent/config/qBittorrent/` are owned by `501:20` with 744/644 perms (container runs as PUID/PGID=1000). **Counterpoint:** first-run WebUI changes (using temp admin password) were written successfully, so permission may only break on subsequent runs or after UID/GID changes; needs validation. (2) WebUI security protections might rewrite/lock config back to “known good” when host/referrer warnings fire (invalid host header / referer mismatch), blocking further updates.
  - Caddy path: `qb.mymedialibrary.example` is proxied with basic auth and no header overrides (Host expected to be preserved). Observed warnings: referer mismatch when navigating from `https://mymedialibrary.example` to qb; host-header mismatch when accessing via `localhost:3275`. Need to verify (not yet confirmed) how Host arrives when coming through Cloudflare/HTTPS.
  - Actions taken: enabled `HostHeaderValidation=true`; set `WebUI\ServerDomains=qb.mymedialibrary.example,media.local,localhost,127.0.0.1,::1`; added `Referrer-Policy: no-referrer` header on `mymedialibrary.example` in Caddy to curb referer warnings. `LocalHostAuth` and whitelist are unchanged (LAN-friendly). Some Caddy config still appears to prevent domain validation and blocks are still happening; this may have been when an invalid password was set in Prowlarr. Need to try this again.
