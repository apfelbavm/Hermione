import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { registerBuiltins } from "../../../../../graph/nodes";
import { nextId } from "../../../../../graph/engine/graphMutations";
import { getDatabaseManager } from "../../../../../server/DatabaseManager";
import { applyCredentialEnvVars } from "../../../../../server/credentialEnv";
import { deployedScriptPath } from "../../../../../server/deployedScriptFile";
import type { LogEntry, RunLog } from "../../../../../server/models";

// Same reasoning as api/simulate/route.ts and api/emulate/run/route.ts: dynamic-importing a
// compiled module and running real node implementations needs a genuine Node environment.
export const runtime = "nodejs";

registerBuiltins();

type Params = Promise<{ projectId: string; flowId: string }>;

interface RequestFieldDescriptor {
  name: string;
  defaultValue: unknown;
}

/** Public HTTP entry point for a deployed Flow's "On HTTP Request" event (nodes/event.ts's
 * event.request, manifest kind "request"). Unlike api/emulate/run/route.ts (kind "run", invoked
 * only from inside another flow via flow.executeFlow), a caller here is an arbitrary outside HTTP
 * client, so failures are reported as real HTTP status codes instead of a `{success, error}` body:
 * 200 with whatever the flow's own Return Flow Values node declared on success, 404 if this Flow
 * was never deployed or has no "On HTTP Request" event, 500 with `{ error }` if the compiled flow
 * itself throws (see code.ts/codegen.ts's compileScriptDef, which now rethrows a script's own
 * errors instead of swallowing them, specifically so a failure here is never silently reported as
 * a 200 with default/empty values). Also persists its own RunLog (kind "request") the same way
 * executeDeployedFlow.ts does for a chained call — otherwise a run triggered by an outside HTTP
 * client would leave no trace on this Flow's own Logs page at all. */
async function handle(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const db = getDatabaseManager();

  const deployed = db.getDeployedScript(flowId);
  if (!deployed || deployed.projectId !== projectId) {
    return Response.json({ error: "This Flow hasn't been deployed yet — click Deploy in the editor first." }, { status: 404 });
  }

  const requestTrigger = deployed.manifest.triggers.find((t) => t.kind === "request");
  if (!requestTrigger) {
    return Response.json({ error: 'The "On HTTP Request" event does not exist in this graph.' }, { status: 404 });
  }

  let jsonBody: Record<string, unknown> = {};
  try {
    jsonBody = (await request.json()) as Record<string, unknown>;
  } catch {
    // No/invalid JSON body is fine — a GET request, or one relying only on query params, has none.
  }
  const queryParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const merged: Record<string, unknown> = { ...queryParams, ...jsonBody }; // JSON body wins over query params on name conflicts

  // Declared by event.request's own describeInstance, in the exact same order codegen.ts compiled
  // its trigger method's real parameters — see eventTriggerArgNamesByNode.
  const declaredFields = (requestTrigger.details.params as RequestFieldDescriptor[] | undefined) ?? [];
  const args = declaredFields.map((field) => (field.name in merged ? merged[field.name] : field.defaultValue));

  const startedAt = new Date().toISOString();
  const entries: LogEntry[] = [];
  function record(message: string): void {
    entries.push({ id: nextId("log"), message, format: "text", timestamp: new Date().toISOString() });
  }

  let executionMs: number | undefined;
  let response: Response;
  try {
    applyCredentialEnvVars(db);

    // Cache-bust the import so a redeploy between two calls in the same server process isn't
    // served Node's stale cached module for this same path — same reasoning as
    // executeDeployedFlow.ts/api/emulate/run/route.ts.
    const url = `${pathToFileURL(deployedScriptPath(flowId)).href}?t=${Date.now()}-${randomUUID()}`;
    const compiled = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;
    const CompiledFlow = compiled.CompiledFlow as new (log: (message: string) => void) => Record<string, unknown>;
    const instance = new CompiledFlow(record);
    const fn = (instance[requestTrigger.functionName] as (...fieldArgs: unknown[]) => Promise<Record<string, unknown> | void>).bind(instance);

    const executionStartedAt = performance.now();
    let returned: Record<string, unknown> | void;
    try {
      returned = await fn(...args);
    } finally {
      executionMs = performance.now() - executionStartedAt;
    }
    response = Response.json(returned && typeof returned === "object" ? returned : {}, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record(`Error: ${message}`);
    response = Response.json({ error: message }, { status: 500 });
  }

  const runLog: RunLog = {
    id: nextId("run"),
    projectId,
    flowId,
    flowName: deployed.flowName,
    startedAt,
    finishedAt: new Date().toISOString(),
    entries,
    kind: "request",
    executionMs,
    revision: deployed.revision,
    version: deployed.version,
  };
  db.appendRun(runLog);

  return response;
}

export const GET = handle;
export const POST = handle;
