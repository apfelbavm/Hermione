import type { LogFormat } from "../graph/engine/types";
import type { TriggerDescriptor } from "../graph/compiler/codegen";

/** Plain data shapes returned by DatabaseManager — never anything SQL/row-shaped (see that file's
 * own doc comment). Safe to import (type-only) from anywhere, including client components, since
 * these carry no runtime code of their own. */

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowSummary {
  id: string;
  projectId: string;
  name: string;
  version: number;
  /** Bumped every time the graph itself is saved (autosave/Save), independent of `version` (which
   * only bumps on an explicit "Save new version" / restore) — see DatabaseManager.saveFlowGraphJson. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** One archived row from `flow_versions` — every one of these is strictly older than the Flow's
 * current live version (see DatabaseManager.saveNewFlowVersion/restoreFlowVersion). Feeds the
 * "Restore old version" page's version-picker dropdown. */
export interface FlowVersionSummary {
  id: string;
  flowId: string;
  version: number;
  name: string;
  createdAt: string;
}

export interface FlowVersion extends FlowVersionSummary {
  graphJson: string | null;
}

export interface LogEntry {
  id: string;
  message: string;
  format: LogFormat;
  timestamp: string;
}

export type RunKind = "simulate" | "production";

export interface RunLog {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt?: string;
  entries: LogEntry[];
  kind: RunKind;
  executionMs?: number;
  /** The Flow's `revision` (production) or the deployed script's own `revision` at the time this ran. */
  revision?: number;
  /** The Flow's `version` (production: the deployed script's own `version`) at the time this ran. */
  version?: number;
}

export interface DeployedScriptSummary {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  manifest: { triggers: TriggerDescriptor[] };
  version: number;
  /** The Flow's own `revision` at the moment it was compiled/deployed — passed into compileGraph. */
  revision: number;
  deployedAt: string;
}

export interface DeployedScript extends DeployedScriptSummary {
  code: string;
}
