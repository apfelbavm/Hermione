# Conventions

## Tests
All test files go in `tests/` at the repo root (mirroring `src/`'s structure), never colocated next to the source file they test.

## Comments
Only add a comment when it describes something that cannot be implicitly derived from naming (functions, variables, types). Keep it to at most 2 sentences. Do not describe what the code does if the names already make that obvious.

## Prefer classes/interfaces over function-soup files
Avoid large single files exporting many standalone functions that all take an instance of the same interface/type as their first argument (the old `graphMutations.ts` pattern). If a function's first parameter is always "the thing it operates on" and behaves like a method, make it an actual method on a class (or otherwise group it with its data) instead of a free function simulating one.

## Ad-hoc task scripts
If you write a script to help carry out a task (a one-off migration/refactor helper, not something the app's code depends on), put it in `scripts/` at the repo root, not scattered loose in the root directory.

## Formatting
After making code changes to a file, run it through the project's configured formatter (Prettier) before considering the change done.

## Node runtime logic placement
`graph/nodes/*.ts` are editor-only (pins/labels/UI). Real execution logic (HTTP calls, provider SDK calls) belongs in `server/functionLibrary*.ts` only, so it's shared between the interpreter and compiled/deployed scripts. See [architecture.md](./architecture.md).

## Interpreter and compiler paths are both mandatory
Every node's `execute`/`evaluate` (interpreter path) must have a matching `compileExecute`/`compileEvaluate` (compiler path) — never add one without the other. See "Two execution paths for a Flow" in [architecture.md](./architecture.md).

## Credentials
Never hardcode or embed credential values in node definitions or compiled/generated code. See [auth.md](./auth.md).
