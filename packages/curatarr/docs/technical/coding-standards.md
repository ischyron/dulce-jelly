# Curatarr Coding Standards

Baseline standards for all changes under `packages/curatarr`.

## 1) Core Rules
- Optimize for clarity, maintainability, and deterministic behavior.
- Keep changes auditable: small diffs, explicit naming, and testable outcomes.
- Prefer portable behavior suitable for self-hosted/community deployments.

## 2) TypeScript and API Contracts
- Use explicit types at boundaries (routes, API client, DB mapping).
- Avoid `any`; use narrow unions and typed helpers.
- When API shapes change, update `src/shared/types/api.ts` in the same change.

## 3) Backend
- Keep filtering, pagination, and aggregates in backend queries/routes.
- Do not move correctness-critical logic to ad-hoc client computation.
- Use parameterized SQL bindings only; never concatenate untrusted input.
- Keep route behavior stable unless the change is intentional and documented.

## 4) Frontend Architecture
- Render from API truth; avoid duplicate client-side derivations where server values exist.
- Prefer shared components for repeated patterns; check `src/ui/src/components/shared` first.
- Keep components focused; move reusable logic to helpers/hooks.
- Reuse design tokens and established interaction patterns across pages.

## 5) Accessibility (A11y)
- Follow WCAG-aligned practices for all user-facing UI. See [a11y.md](./a11y.md) for the full developer guide.
- Ensure keyboard accessibility, visible focus states, and semantic structure.
- Provide accessible names for interactive controls — inline strings for genuine exceptions (icon-only controls, unlabelled inputs); do NOT add `aria-label` to controls that already have visible text content.
- Disclosure buttons must carry `aria-expanded` + `aria-haspopup`.
- Progress indicators must use `role="progressbar"` with `aria-valuenow/min/max`.
- Charts (SVG/canvas) must be wrapped with `role="img"` + `aria-label`.
- Maintain sufficient contrast and do not rely on color alone for meaning.
- Ensure errors/status updates are perceivable by assistive technologies.
- Add/update accessibility coverage where relevant (axe suite: `npm run test:e2e`).

## 6) Content and Code Separation (i18n-Ready)
- Keep user-facing copy separate from component logic so localization is possible.
- Avoid hardcoding repeated UI strings directly inside components.
- Prefer centralized/localized message sources (feature-scoped or shared) over inline literals.
- Reuse shared terms consistently (status labels, actions, hints) to simplify translation.
- New UI features should be added in a way that can be localized without refactoring logic.

## 7) Refactor As You Go
- After feature completion, run a quick cleanup pass on touched files.
- Remove dead code, stale branches, unused imports/helpers, and obsolete comments.
- Apply behavior-preserving cleanups that reduce complexity.
- If a module receives many feature changes, include modularization in the first cut, not later.
- For meaningful cleanup scope, use a dedicated `refactor:` commit.

## 8) Testing, Docs, and Commits
- Update tests for behavior changes (especially filters, aggregates, pagination semantics).
- Keep tests aligned with user-visible behavior, not implementation trivia.
- Update docs when behavior/contracts change.
- Keep commits scoped to one concern and avoid unrelated edits.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.).
