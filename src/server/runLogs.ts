import type { LogFormat } from "../engine/types";
import { MAX_RUNS_PER_PROJECT } from "../shared/runLogConstants";
import { getDb } from "./db";

export { MAX_RUNS_PER_PROJECT };

export interface LogEntry {
  id: string;
  message: string;
  format: LogFormat;
  timestamp: string;
}

/** One Simulate run's worth of log output, grouped together. `flowName` is a snapshot taken at run
 * time (not a live join) so a run started against a Flow that's since been renamed or deleted still
 * reads sensibly in the Logs page. */
export interface RunLog {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt?: string;
  entries: LogEntry[];
}

interface RunRow {
  id: string;
  project_id: string;
  flow_id: string;
  flow_name: string;
  started_at: string;
  finished_at: string | null;
  entries_json: string;
}

function toRunLog(row: RunRow): RunLog {
  return {
    id: row.id,
    projectId: row.project_id,
    flowId: row.flow_id,
    flowName: row.flow_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    entries: JSON.parse(row.entries_json) as LogEntry[],
  };
}

/** Every run for `projectId`, newest first. */
export function listRuns(projectId: string): RunLog[] {
  const rows = getDb().prepare<[string], RunRow>("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC").all(projectId);
  return rows.map(toRunLog);
}

/** Persists a completed run and caps the project's history at MAX_RUNS_PER_PROJECT, deleting the
 * oldest rows past that count in the same transaction. */
export function appendRun(run: RunLog): void {
  const db = getDb();
  const insertAndCap = db.transaction((r: RunLog) => {
    db.prepare("INSERT INTO runs (id, project_id, flow_id, flow_name, started_at, finished_at, entries_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(r.id, r.projectId, r.flowId, r.flowName, r.startedAt, r.finishedAt ?? null, JSON.stringify(r.entries));

    const staleIds = db
      .prepare<[string, number], { id: string }>("SELECT id FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT -1 OFFSET ?")
      .all(r.projectId, MAX_RUNS_PER_PROJECT);
    if (staleIds.length > 0) {
      const placeholders = staleIds.map(() => "?").join(", ");
      db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...staleIds.map((row) => row.id));
    }
  });
  insertAndCap(run);
}
