import type { LogFormat } from "../engine/types";
import type { TriggerDescriptor } from "../compiler/codegen";

/** Plain data shapes returned by DatabaseManager — never anything SQL/row-shaped (see that file's
 * own doc comment). Safe to import (type-only) from anywhere, including client components, since
 * these carry no runtime code of their own. */

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowSummary {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  message: string;
  format: LogFormat;
  timestamp: string;
}

/** "simulate" = the editor's own Simulate button (interpreted execution, see api/simulate/route.ts).
 * "production" = a Flow's actual COMPILED output (api/emulate/run/route.ts), run the
 * same way it would after being deployed standalone — no visual step-through, just its log output. */
export type RunKind = "simulate" | "production";

/** One run's worth of log output, grouped together — either a Simulate run or a production run (see
 * RunKind above). `flowName` is a snapshot taken at run time (not a live join) so a run started
 * against a Flow that's since been renamed or deleted still reads sensibly in the Logs page. */
export interface RunLog {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt?: string;
  entries: LogEntry[];
  kind: RunKind;
}

/** A Flow's compiled output as it stood at the moment "Deploy" was last clicked in the editor (see
 * api/projects/[projectId]/flows/[flowId]/deploy/route.ts) — one row per Flow (redeploying replaces
 * the previous row rather than growing a history). Running a Flow from the Emulate page
 * (api/emulate/run/route.ts) executes exactly this snapshot, not whatever the graph
 * currently looks like — the same "deploy a version, then run THAT version" separation a real
 * deployment target would have. Summary form (no `code`) is what listings return; the full record
 * (server-only, never sent to the client) is only ever read right before actually running it. */
export interface DeployedScriptSummary {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  manifest: { triggers: TriggerDescriptor[] };
  deployedAt: string;
}

export interface DeployedScript extends DeployedScriptSummary {
  code: string;
}
