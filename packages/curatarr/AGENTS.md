# Curatarr Agent Guide

This file is the canonical workflow policy for agent execution in `packages/curatarr`.
If `CLAUDE.md` and this file conflict, this file wins.

## Project Status
- Curatarr is a privately developed media curation tool, pending open-source release, currently being tested as one package in a parent monorepo.

## Scope
- Applies to all work that changes Curatarr code, config, tests, docs, or deployment under `packages/curatarr`.
- The completion policy is strict. No conditional `DONE` is allowed.
- Commands must remain portable. Do not hardcode user-specific absolute paths.

## MCP Prerequisites (Required Before Validation Gates)
Before running validation gates, confirm required MCP servers are configured in Codex user scope.

Required MCP servers:
- `playwright` -> `npx -y @playwright/mcp@latest`
- `chrome` -> `npx -y chrome-devtools-mcp@latest`

Required preflight command:
- `codex mcp list`

If either required MCP server is missing or disabled:
- Do not mark task `DONE`.
- Mark `BLOCKED` (or remain `IN-PROGRESS`) and record missing MCP preflight in TODO evidence.

## Required Workflow (Definition of Done)
A task can be marked `DONE` only after all gates below pass.

1. Develop
- Implement the requested behavior and cover edge cases.
- Remove stale/unused code introduced by the change.

2. Unit/Interaction Tests
- Run relevant automated tests for changed behavior.
- Any failing required test blocks `DONE`.
- Recommended command: `npm run test`

3. Functional E2E (Playwright)
- Run Curatarr Playwright e2e suite.
- Any failing e2e gate blocks `DONE`.
- Required command: `npm run test:e2e`

4. Manual Verification (Chrome MCP)
- Mandatory when UI behavior or user-visible API behavior changes.
- Validate the changed flow manually using Chrome MCP and record what was verified.
- Minimum manual verification record must include:
  - flow exercised
  - expected vs actual behavior
  - pass/fail decision

5. Git Gate
- Commit the change on the working branch.
- Push must succeed.
- Missing commit or missing push blocks `DONE`.

6. Deploy Gate
- Build and deploy Curatarr service.
- Docker Compose commands must be run from project root relative to `packages/curatarr`: `../../`.
- Minimum required gate:
  - `cd ../../ && docker compose build curatarr`
  - `cd ../../ && docker compose up -d curatarr`
- Restart/update shortcut (allowed): `cd ../../ && docker compose up -d --build curatarr`
- Failed or skipped deploy blocks `DONE`.

## Gate Failure Policy
- If any required gate cannot run or fails, status must be `BLOCKED` (or remain `IN-PROGRESS`).
- Do not mark as `DONE` with follow-up questions.
- Record the exact failed/missing gate and reason in TODO.

## TODO Evidence Requirement
For each task moved to `DONE`, include compact evidence inline in the TODO item.
Use this template:

```text
Evidence:
- MCP preflight: codex mcp list -> <pass/fail>; playwright=<enabled/disabled>; chrome=<enabled/disabled>
- Dev: <what changed>
- Unit/interaction: <command> -> <pass/fail>
- E2E: <command> -> <pass/fail>
- Chrome MCP: <scope/results> OR N/A (no UI/user-visible API change)
- Git: <commit-hash>, push <ok/fail>
- Deploy: <command(s)> -> <ok/fail>
- Date: YYYY-MM-DD
```

## Operational Notes
- Keep temporary notes/logs under `temp/`.
- Prefer safe, auditable behavior for file operations and integrations.
- Do not close work items early with unresolved required gates.
- Prefer code-first truth for behavior checks: run system, test, and verify rather than relying on roadmap text.
