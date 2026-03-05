# Curatarr Audit TODO — 2026-03-05

### Critical (P0)
- ✅ Guard destructive deletes in [`src/server/routes/movies.ts`](/Users/haaris/workspace/curatarr-wt/packages/curatarr/src/server/routes/movies.ts): allowlist to configured library roots, refuse symlinks, async delete.
- ✅ Validate scan entrypoints (`src/server/routes/scan.ts`) against configured `libraryRoots`; realpath + symlink guard.
- ✅ Fail fast when `ffprobe` is missing (`src/scanner/ffprobe.ts`); cached availability check.

### High (P1)
- ✅ Reduce DB churn during scans (`src/scanner/scan.ts`): cache `getFilesForMovie` per folder.
- ✅ Propagate worker errors/cancellation in scan pool (`src/scanner/scan.ts`).
- ✅ Extend `walkLibrary` coverage to nested disc/BDMV subfolders (one level).
- ✅ Clamp and validate scheduler settings (`src/cli/serve.ts`, `src/server/routes/settings.ts`).

### Medium (P2)
- ✅ Add request-level tests for critical routes (`movies`, `scan`, `settings`, `verify`) to cover error paths and path validation.
- ✅ Tighten SSE lifecycle cap (`src/server/sse.ts`): max subscribers + drop dead listeners.
- ✅ Switch remaining synchronous FS in HTTP handlers beyond movies delete (`fsRoutes`) to async + symlink checks where user-facing.
