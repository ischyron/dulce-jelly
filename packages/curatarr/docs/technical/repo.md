# Repository

`packages/curatarr/src/server` contains API routes, schedulers, and runtime orchestration.
`packages/curatarr/src/ui` contains the Vite/React frontend and feature components.
`packages/curatarr/src/integrations` contains external service clients (Jellyfin, Prowlarr).
`packages/curatarr/src/shared` contains cross-layer utilities/types used by server and UI.
See [architecture.md](./architecture.md) for how these parts connect at runtime.
