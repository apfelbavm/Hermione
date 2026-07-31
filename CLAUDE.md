# Project instructions

1. **Test file location**: All test files go in the `tests/` folder at the repo root, not alongside the source file they test.

2. **Comments**: Only add a comment when it describes something that cannot be implicitly derived from naming (functions, variables, types). Keep it to at most 2 sentences. Do not describe what the code does if the names already make that obvious.

3. **Prefer classes/interfaces over function-soup files**: Avoid large single files exporting many standalone functions that all take an instance of the same interface/type as their first argument (e.g. the old `graphMutations.ts` pattern). If a function's first parameter is always "the thing it operates on" and behaves like a method, make it an actual method on a class (or otherwise group it with its data) instead of a free function that simulates one.

4. **Ad-hoc task scripts**: If you write a script to help yourself carry out a task (e.g. a one-off migration/refactor helper, not something the app's code depends on), put it in a dedicated folder at the repo root (e.g. `scripts/`), not scattered loose in the root directory.

5. **Formatting**: After making code changes to a file, run it through the project's configured formatter (e.g. Prettier) before considering the change done.
