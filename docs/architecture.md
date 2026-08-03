# Architecture

## Top-level layout
- `src/app` — Next.js App Router: pages (`projects/`, `emulate/`, `credential-vault/`, `logs/`, `ai-docs/`) and API routes (`api/emulate`, `api/simulate`, `api/hooks/[projectId]/[flowId]`, `api/credentials`, `api/projects`, `api/runs`).
- `src/graph` — the visual node-graph editor + two execution paths (interpreter and compiler). See below.
- `src/server` — DB access, deployed-flow execution, and the one shared home for node runtime logic.
- `src/lib` — thin wrappers around each 3rd-party provider's SDK/API client (one file per provider).
- `src/credentials` — credential type registry (field defs) + shared client-safe types.
- `src/client`, `src/components`, `src/state`, `src/hooks`, `src/styles` — editor UI (React) and its Zustand-like store.
- `data/deployed-scripts/*.mjs` — compiled output of a Flow, deployed and run standalone via `executeDeployedFlow`.
- `scripts/` — one-off/ad-hoc task scripts (not app code).
- `tests/` — all test files, mirroring `src/` structure (never colocated with source).

## `src/graph` internals
- `engine/` — the interpreter: `Graph`, `NodeInstance`, `ExecutionContext`, `executor.ts` (walks the graph directly, node-by-node). Used by the Emulate/Simulate pages.
- `compiler/codegen.ts` — compiles a `Graph` into a standalone ESM script (a `CompileResult` with `code` + a manifest of triggers/variables). Output lands in `data/deployed-scripts/`.
- `nodes/*.ts` — **editor-only** node type definitions (pins, UI, `registerNode`) for one category each (http, jira, google, dropbox, sftp, soap, auth, oauth2Saml, ...). Do not put real runtime/HTTP logic here — see "Two execution paths" below.
- `interaction/` — canvas pointer/keyboard handling (drag, shortcuts).
- `overlay/` — canvas-adjacent UI widgets (tooltips, context menus, the script/code editor, search menu).
- `render/` — canvas drawing (grid, wires, nodes, comments, hit-testing, camera/layout math).
- `persistence/` — graph JSON `schema.ts`, `load.ts`, `save.ts`.
- `structs/`, `enum/` — per-provider struct/enum definitions surfaced as pin types (mirrors the provider list in `nodes/`).

## Two execution paths for a Flow
A Flow's actual runtime logic (e.g. an HTTP call, a Jira API call) is written **once**, in `src/server/functionLibrary*.ts`, and consumed by both paths:
1. **Interpreter** (Emulate/Simulate pages → `api/simulate`, `api/emulate/run`): `engine/executor.ts` walks the live in-memory graph and calls into `functionLibrary*.ts` directly for each node's execution.
2. **Compiled/deployed** (`compiler/codegen.ts` generates code that imports `functionLibrary*.ts` directly — see `compileUtils.ts`'s `FUNCTION_LIBRARY_IMPORT`). The generated script is saved under `data/deployed-scripts/` and later invoked by `server/executeDeployedFlow.ts` (used by `flow.executeFlow` nodes and by `api/hooks/[projectId]/[flowId]`).

`graph/nodes/*.ts` must stay editor-only (pins, labels, UI) — never add real request/API logic there; it belongs in `server/functionLibrary*.ts` so both execution paths share it.

## Data / persistence
- `src/server/DatabaseManager.ts` — SQLite (better-sqlite3) access; the only place that touches raw rows.
- `src/server/models.ts` — plain DTOs returned by `DatabaseManager` (e.g. `ProjectSummary`, `FlowSummary`, `RunLog`) — safe to import anywhere, including client components.
- Flow versioning: `flow.revision` bumps on every autosave/save; `flow.version` + `flow_versions` rows only bump on an explicit "Save new version" / restore (see `RestoreVersion*` components).

## Where to look
- Full auth/credential flow: [auth.md](./auth.md)
- Adding/understanding a 3rd-party integration: [integrations.md](./integrations.md)
- Coding conventions: [conventions.md](./conventions.md)
