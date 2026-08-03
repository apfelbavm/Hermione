# Project

## Architecture
- `src/app` = Next.js pages + API routes
- `src/graph` = visual node-graph editor, interpreter, and compiler
- `src/server` = DB access, deployed-flow execution, shared node runtime logic (`functionLibrary*.ts`)
- `src/lib` = thin provider API clients (Dropbox, GitHub, Google, Jira, Facebook, Azure, Microsoft 365, ...)
- `src/credentials` = credential type registry
- `data/deployed-scripts` = compiled Flow output (`.mjs`), run via `executeDeployedFlow`

## Important rules
- Test files go in `tests/` at the repo root, never colocated with the source they test.
- `graph/nodes/*.ts` are editor-only (pins/UI) — real execution logic lives ONLY in `server/functionLibrary*.ts`, shared by the interpreter and compiled/deployed scripts.
- Every node's `execute`/`evaluate` must have a matching `compileExecute`/`compileEvaluate` — the interpreter and compiler paths are both mandatory, never just one.
- Never hardcode/embed credential values in node definitions or compiled output — deployed scripts read them via `HERMIONE_CRED_*` env vars (`server/credentialEnv.ts`).
- Prefer classes/interfaces over function-soup files (no free functions all taking the same "self" arg).
- Comments only when naming can't convey the info; max 2 sentences.
- Ad-hoc task scripts go in `scripts/`, not the repo root.
- Format changed files with Prettier before finishing.

## Where to look
- Architecture details: [docs/architecture.md](../docs/architecture.md)
- Integrations / connectors: [docs/integrations.md](../docs/integrations.md)
- Auth & credentials: [docs/auth.md](../docs/auth.md)
- Coding conventions: [docs/conventions.md](../docs/conventions.md)
