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
  version: number;
  createdAt: string;
  updatedAt: string;
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
}

export interface DeployedScriptSummary {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  manifest: { triggers: TriggerDescriptor[] };
  version: number;
  deployedAt: string;
}

export interface DeployedScript extends DeployedScriptSummary {
  code: string;
}
