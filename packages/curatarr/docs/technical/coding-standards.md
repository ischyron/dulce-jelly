# Curatarr Coding Standards

This guide defines baseline engineering standards for changes under `packages/curatarr`.

## Core Principles
- Prefer clear, maintainable code over clever one-liners.
- Keep behavior deterministic and portable for self-hosted/community use.
- Make changes auditable: small diffs, explicit naming, and testable outcomes.

## TypeScript and API Contracts
- Use strict, explicit types for external boundaries (routes, client responses, DB mapping).
- Update shared API contracts in `src/shared/types/api.ts` whenever response/request shapes change.
- Avoid `any`; use narrow unions and typed helpers instead.

## Backend
- Keep filtering, pagination, and aggregate calculations in backend routes/queries.
- Avoid moving correctness-critical logic to client-only computation.
- Use parameterized SQL/bindings; never concatenate untrusted user input into SQL.
- Preserve route behavior stability unless change is intentional and documented.

## Frontend
- UI should render from API truth, not duplicated ad-hoc client derivations when server can provide canonical values.
- Keep components focused: move reusable formatting/filter logic into helper modules.
- Maintain accessible labels and clear user-visible text for controls.

## Database and Data Safety
- Do not introduce destructive behavior without explicit confirmation paths.
- Prefer additive schema and migration-safe changes.
- Keep filesystem operations safe and auditable.

## Testing Expectations
- Add or update tests for behavior changes, especially route filters, aggregations, and pagination semantics.
- Ensure test intent matches real user behavior (not implementation trivia).
- Prevent regressions with targeted tests in `test/*.test.mjs` and e2e where applicable.

## Documentation Expectations
- When behavior changes, update relevant docs in `docs/technical` and/or API docs.
- Keep terminology consistent across code, UI labels, and documentation.

## Commit Hygiene
- Keep commits scoped to one concern.
- Do not include unrelated local edits.
- Commit messages should describe behavior change clearly.
