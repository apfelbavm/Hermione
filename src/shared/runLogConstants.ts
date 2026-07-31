/** Shared between src/server/runLogs.ts (enforces the cap) and the Logs page (states it in the UI)
 * — its own file, not declared in either, so a client component can read the number without pulling
 * in server/runLogs.ts's better-sqlite3 dependency. */
export const MAX_RUNS_PER_PROJECT = 50;
