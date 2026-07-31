import type { LogFormat } from "../engine/types";

export type { LogFormat };

export interface LogEntry {
  id: string;
  message: string;
  format: LogFormat;
  timestamp: string;
}

/** One Simulate run's worth of log output, grouped together — a run may touch many nodes/many Print
 * calls, all captured under one entry list here. `flowName` is a snapshot taken at run time (not a
 * live lookup) so a run started against a Flow that's since been renamed or deleted still reads
 * sensibly in the Logs page. */
export interface RunLog {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt?: string;
  entries: LogEntry[];
}

/** Oldest runs are dropped once a project passes this many — an explicit, stated cap (the Logs page
 * says so) rather than letting localStorage grow without bound for a long-lived project. */
export const MAX_RUNS_PER_PROJECT = 50;

const runsKey = (projectId: string): string => `hermione:project:${projectId}:runs`;

function readRuns(projectId: string): RunLog[] {
  const raw = localStorage.getItem(runsKey(projectId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RunLog[];
  } catch {
    return [];
  }
}

/** Every run for `projectId`, newest first. */
export function listRuns(projectId: string): RunLog[] {
  return readRuns(projectId).slice().reverse();
}

export function appendRun(run: RunLog): void {
  const runs = readRuns(run.projectId);
  runs.push(run);
  const capped = runs.length > MAX_RUNS_PER_PROJECT ? runs.slice(runs.length - MAX_RUNS_PER_PROJECT) : runs;
  localStorage.setItem(runsKey(run.projectId), JSON.stringify(capped));
}

/** Called when the owning project itself is deleted (see persistence/projects.ts's deleteProject) —
 * a project's run history has no meaning once the project it belongs to is gone. */
export function clearRunsForProject(projectId: string): void {
  localStorage.removeItem(runsKey(projectId));
}
