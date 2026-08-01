import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { getDatabaseManager } from "./DatabaseManager.ts";
import { applyCredentialEnvVars } from "./credentialEnv.ts";
import { deployedScriptPath } from "./deployedScriptFile.ts";
import { nextId } from "../graph/engine/graphMutations.ts";
import type { LogEntry, RunLog } from "./models.ts";

export interface ExecuteFlowResult {
  success: boolean;
  error: string;
  outputs: Record<string, unknown>;
}

/** Runs another Flow's DEPLOYED compiled output (never the currently-edited graph — see
 * server/DatabaseManager.ts's DeployedScript) and reports back whatever it declared via a
 * "flow.return" node (see nodes/flow.ts), the same dynamic-import approach
 * api/emulate/run/route.ts's production-run path already uses. Shared by both runtime paths a
 * flow.executeFlow node can take: the interpreter's own ExecutionContext.executeFlow hook (wired in
 * by api/simulate/route.ts) and a DEPLOYED flow's own compiled flow.executeFlow, which imports this
 * exact function directly (see compileUtils.ts's EXECUTE_FLOW_IMPORT) instead of re-implementing
 * this lookup inline in generated code. Fires the target's "On Execute" event (nodes/event.ts's
 * event.execute, manifest kind "execute") — NOT "On Run" (kind "run"), which only ever fires from
 * the Emulate page's own Run button (see api/emulate/run/route.ts). `params` are flow.executeFlow's
 * own user-mapped inputs (by name) — matched against the target's declared fields the exact same
 * way api/hooks/[projectId]/[flowId]/route.ts matches an HTTP request's merged query/body params,
 * falling back to that field's own default when the caller didn't map it. Never throws: every
 * failure mode (never deployed, no "On Execute" event, the deployed script itself throwing) is
 * reported as `{ success: false, error }` instead, since a calling flow reads success/error off
 * real output pins rather than a try/catch. Also persists its own RunLog (kind "chained") for the
 * triggered flow itself — otherwise its log output would only ever show up buried inside the
 * CALLING flow's own run, under the caller's own flowId, with no trace of it under the triggered
 * flow's own Logs — NOT the calling flow's, whose log should only ever show its own steps. */
export async function executeDeployedFlow(projectId: string, flowId: string, params: Record<string, unknown> = {}): Promise<ExecuteFlowResult> {
  if (!flowId) {
    return { success: false, error: "No Flow selected — nothing to execute.", outputs: {} };
  }

  const db = getDatabaseManager();
  const deployed = db.getDeployedScript(flowId);
  if (!deployed || (projectId && deployed.projectId !== projectId)) {
    return { success: false, error: "Script not compiled, couldn't execute.", outputs: {} };
  }

  const startedAt = new Date().toISOString();
  const entries: LogEntry[] = [];
  function record(message: string): void {
    entries.push({ id: nextId("log"), message, format: "text", timestamp: new Date().toISOString() });
  }

  let executionMs: number | undefined;
  let result: ExecuteFlowResult;
  try {
    const executeTrigger = deployed.manifest.triggers.find((t) => t.kind === "execute");
    if (!executeTrigger) {
      result = { success: false, error: 'The "On Execute" event does not exist in this graph.', outputs: {} };
    } else {
      applyCredentialEnvVars(db);

      // Cache-bust the import so a redeploy between two calls in the same server process isn't served
      // Node's stale cached module for this same path — same reasoning as api/emulate/run/route.ts.
      const url = `${pathToFileURL(deployedScriptPath(flowId)).href}?t=${Date.now()}-${randomUUID()}`;
      const compiled = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;
      const CompiledFlow = compiled.CompiledFlow as new (log: (message: string) => void) => Record<string, unknown>;
      const instance = new CompiledFlow(record);
      const fn = (instance[executeTrigger.functionName] as (...fieldArgs: unknown[]) => Promise<Record<string, unknown> | void>).bind(instance);

      // Declared by event.execute's own describeInstance, in the exact same order codegen.ts
      // compiled its trigger method's real parameters (see eventTriggerArgNamesByNode) — matched
      // by name against the caller's own params, same as the hooks route's merged query/body object.
      const declaredFields = (executeTrigger.details.params as { name: string; defaultValue: unknown }[] | undefined) ?? [];
      const args = declaredFields.map((field) => (field.name in params ? params[field.name] : field.defaultValue));

      const executionStartedAt = performance.now();
      try {
        const returned = await fn(...args);
        result = { success: true, error: "", outputs: returned && typeof returned === "object" ? returned : {} };
      } finally {
        executionMs = performance.now() - executionStartedAt;
      }
    }
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err), outputs: {} };
  }

  const runLog: RunLog = {
    id: nextId("run"),
    projectId: deployed.projectId,
    flowId,
    flowName: deployed.flowName,
    startedAt,
    finishedAt: new Date().toISOString(),
    entries,
    kind: "chained",
    executionMs,
    revision: deployed.revision,
    version: deployed.version,
  };
  db.appendRun(runLog);

  return result;
}
