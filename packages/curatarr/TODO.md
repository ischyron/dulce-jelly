# Curatarr Audit TODO — 2026-03-05

### Critical (P0)
- Guard destructive deletes in [`src/server/routes/movies.ts`](/Users/haaris/workspace/curatarr-wt/packages/curatarr/src/server/routes/movies.ts): enforce library-root allowlist, reject symlinks, add dry-run/async handling; current implementation can remove arbitrary paths via stored `folder_path` and blocks the event loop with `fs.rmSync`.
- Validate scan entrypoints (`src/server/routes/scan.ts`) against configured `libraryRoots`; reject arbitrary user-supplied paths and normalise/realpath before dispatch.
- Fail fast when `ffprobe` is missing or unreachable in [`src/scanner/ffprobe.ts`]; surface a clear actionable error rather than a generic spawn failure inside scan queues.

### High (P1)
- Reduce DB churn during scans (`src/scanner/scan.ts`): cache `getFilesForMovie` results per folder or batch within a transaction; current loop issues one query per file causing O(N²) work on large directories.
- Propagate worker errors and cancellation in `runPool` (`src/scanner/scan.ts`): bubble fatal errors, honour `AbortSignal` mid-pool, and ensure the scan run is marked failed/cancelled rather than silently continuing.
- Extend `walkLibrary` coverage (`src/scanner/walker.ts`): optional recursion or explicit logging for nested structures (BDMV/Extras/BDJO) to avoid silent drops.
- Clamp and validate scheduler settings (`src/cli/serve.ts`, `src/server/routes/settings.ts`): enforce sane min/max for `jfSyncIntervalMin`, `scoutAutoIntervalMin`, and batch sizes when reading settings.

### Medium (P2)
- Add request-level tests for critical routes (`movies`, `scan`, `settings`, `verify`) to exercise error paths, path validation, and deletion safeguards.
- Tighten SSE lifecycle (`src/server/sse.ts`): bound subscriber set, expire idle subscriptions, and expose metrics to detect leaking connections; replay buffer already capped but subscribers are not.
- Replace synchronous filesystem operations in HTTP handlers (`src/server/routes/movies.ts`) with async equivalents and explicit symlink checks to avoid event-loop stalls and accidental traversal.
