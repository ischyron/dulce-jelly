# Frontend

Curatarr frontend is a React app under `packages/curatarr/src/ui` with route entries in `src/pages` and reusable feature/shared UI in `src/components`.
The API boundary for UI lives in `src/api/client.ts`, backed by shared contracts in `../shared/types/api.ts`.
Feature components are grouped by domain (`library`, `dashboard`, `scout-queue`, `settings`) while cross-feature primitives live in `components/shared`.
For system-wide context and dependency flow, see [architecture.md](./architecture.md).
