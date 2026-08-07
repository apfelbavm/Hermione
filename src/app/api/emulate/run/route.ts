import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { registerBuiltins } from "../../../../graph/nodes";
import { nextId } from "@hermione/graph/engine/graphMutations";
import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { applyCredentialEnvVars } from "@hermione/core/server/credentialEnv";
import { deployedScriptPath } from "@hermione/core/server/deployedScriptFile";
import type { LogEntry, RunLog } from "@hermione/core/server/models";

// Same reasoning as api/simulate/route.ts: dynamic-importing a compiled module and running real
// node implementations (crypto/http/etc.) needs a genuine Node environment, not the edge runtime.
export const runtime = "nodejs";

registerBuiltins();

interface RunManualRequestBody {
  projectId: string;
  flowId: string;
}

/** Runs a Flow's DEPLOYED compiled output (see api/projects/[projectId]/flows/[flowId]/deploy/route.ts
 * and DatabaseManager.getDeployedScript) — a snapshot taken the last time "Deploy" was clicked in the
 * editor, not whatever the graph currently looks like — rather than the INTERPRETED graph
 * api/simulate's route runs. Only the "On Deploy" trigger (manifest kind "deploy" — nodes/event.ts's
 * event.deploy, which compiles to a function named "eventDeploy" by default) fires here: unlike
 * "On Execute"/"On HTTP Request", which each already have their own real invocation path
 * (executeDeployedFlow.ts, api/hooks/[projectId]/[flowId]/route.ts), "On Deploy" only ever fires once
 * automatically right after a deploy (see the deploy route's fireOnDeployEvent) — this button is the
 * only way to fire it again on demand afterwards. If the graph has no such node, that's reported as a
 * log line (see the "EventDeploy" message below), not an error — the deployment itself is still valid,
 * it just has nothing wired to this trigger. Every credential the graph might need is pulled from the
 * Credential Vault into env vars first (see server/credentialEnv.ts) so a compiled node reading one by
 * name (e.g. oauth2Saml) finds it the same way it would after being deployed standalone. Persists the
 * result as a RunLog tagged kind: "manual" so the Logs page can tell it apart from the deploy-triggered
 * "deploy" run. */
export async function POST(request: Request): Promise<Response> {
  let body: RunManualRequestBody;
  try {
    body = (await request.json()) as RunManualRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, flowId } = body;
  const db = getDatabaseManager();

  const deployed = db.getDeployedScript(flowId);
  if (!deployed || deployed.projectId !== projectId) {
    return Response.json({ error: "This Flow hasn't been deployed yet — click Deploy in the editor first." }, { status: 400 });
  }

  const entries: LogEntry[] = [];
  function recordLogEntry(message: string): void {
    entries.push({ id: nextId("log"), message, format: "text", timestamp: new Date().toISOString() });
  }

  const startedAt = new Date().toISOString();
  let executionMs: number | undefined;
  try {
    const runTrigger = deployed.manifest.triggers.find((t) => t.kind === "deploy");

    if (!runTrigger) {
      recordLogEntry('The "EventDeploy" function does not exist in this graph.');
    } else {
      await applyCredentialEnvVars(db);

      // The file on disk always reflects the LATEST deploy (see writeDeployedScriptFile) — cache-bust
      // the import so a redeploy between two runs in the same server process isn't served Node's
      // stale cached module for this same path.
      const url = `${pathToFileURL(deployedScriptPath(flowId)).href}?t=${Date.now()}-${randomUUID()}`;
      // The compiled module's path is only known at request time — never statically resolvable —
      // so bundlers must leave this import() alone and defer it to Node's real ESM loader.
      const compiled = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;

      // Unlike the interpreter's ExecutionContext.log(message, format), compiled output's log
      // only ever takes one already-formatted string (see debug.ts's compileExecute, which bakes
      // formatForLog's output into the call site) — so every entry here is plain "text". A fresh
      // instance is exactly one run (see codegen.ts's CompiledFlow doc comment) — global variables
      // start over at their declared defaults every time, same as re-launching a plain script.
      const CompiledFlow = compiled.CompiledFlow as new (log: (message: string) => void) => Record<string, unknown>;
      const instance = new CompiledFlow((message: string) => recordLogEntry(message));
      const fn = (instance[runTrigger.functionName] as () => Promise<void>).bind(instance);

      // Measures only the compiled script's own execution (the fn() call itself) — not module
      // resolution/import above, which is run-harness overhead, not the script's own work. Recorded
      // in a finally so a run that throws still reports how long it ran before failing; the outer
      // catch below still records the failure itself as a log line. This is metadata ABOUT the run
      // (see RunLog.executionMs), not something the script itself logged, so it's carried on the
      // RunLog directly rather than pushed into `entries`.
      const executionStartedAt = performance.now();
      try {
        await fn();
      } finally {
        executionMs = performance.now() - executionStartedAt;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordLogEntry(`Error: ${message}`);
  }

  const runLog: RunLog = {
    id: nextId("run"),
    projectId,
    flowId,
    flowName: deployed.flowName,
    startedAt,
    finishedAt: new Date().toISOString(),
    entries,
    kind: "manual",
    executionMs,
    revision: deployed.revision,
    version: deployed.version,
  };
  db.appendRun(runLog);

  return Response.json({ run: runLog });
}
