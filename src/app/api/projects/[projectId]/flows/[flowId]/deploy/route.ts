import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { registerBuiltins } from "../../../../../../../graph/nodes";
import { compileGraph } from "../../../../../../../graph/compiler/codegen";
import { nextId } from "../../../../../../../graph/engine/graphMutations";
import { deserializeGraph } from "../../../../../../../graph/persistence/load";
import { getDatabaseManager, type DatabaseManager } from "../../../../../../../server/DatabaseManager";
import { applyCredentialEnvVars } from "../../../../../../../server/credentialEnv";
import { deployedScriptPath, writeDeployedScriptFile } from "../../../../../../../server/deployedScriptFile";
import type { DeployedScript, LogEntry, RunLog } from "../../../../../../../server/models";

export const runtime = "nodejs";

registerBuiltins();

type Params = Promise<{ projectId: string; flowId: string }>;

interface DeployRequestBody {
  graph: string;
}

/** Fires the just-deployed script's "On Deploy" event (nodes/event.ts's event.deploy, manifest
 * kind "deploy"), if it declared one — same dynamic-import approach as api/emulate/run/route.ts's
 * production-run path, since the freshly-written file on disk (see writeDeployedScriptFile above)
 * is exactly what a real "On Deploy" firing should run. A no-op (not an error) when the graph has
 * no such node: deploying is still valid, it just has nothing wired to that event. Persists its
 * own RunLog (kind "deploy") the same way a production/chained run does, so this shows up
 * alongside them on the Logs page. Never throws back to the caller: a failing "On Deploy" event
 * doesn't mean the deploy itself failed — it already succeeded by the time this runs. */
async function fireOnDeployEvent(db: DatabaseManager, deployed: DeployedScript): Promise<void> {
  const deployTrigger = deployed.manifest.triggers.find((t) => t.kind === "deploy");
  if (!deployTrigger) return;

  const startedAt = new Date().toISOString();
  const entries: LogEntry[] = [];
  function recordLogEntry(message: string): void {
    entries.push({ id: nextId("log"), message, format: "text", timestamp: new Date().toISOString() });
  }

  let executionMs: number | undefined;
  try {
    applyCredentialEnvVars(db);

    const url = `${pathToFileURL(deployedScriptPath(deployed.flowId)).href}?t=${Date.now()}-${randomUUID()}`;
    const compiled = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;
    const CompiledFlow = compiled.CompiledFlow as new (log: (message: string) => void) => Record<string, unknown>;
    const instance = new CompiledFlow((message: string) => recordLogEntry(message));
    const fn = (instance[deployTrigger.functionName] as () => Promise<void>).bind(instance);

    const executionStartedAt = performance.now();
    try {
      await fn();
    } finally {
      executionMs = performance.now() - executionStartedAt;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordLogEntry(`Error: ${message}`);
  }

  const runLog: RunLog = {
    id: nextId("run"),
    projectId: deployed.projectId,
    flowId: deployed.flowId,
    flowName: deployed.flowName,
    startedAt,
    finishedAt: new Date().toISOString(),
    entries,
    kind: "deploy",
    executionMs,
    revision: deployed.revision,
    version: deployed.version,
  };
  db.appendRun(runLog);
}

export async function POST(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;

  let body: DeployRequestBody;
  try {
    body = (await request.json()) as DeployRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDatabaseManager();
  const flow = db.getFlow(projectId, flowId);
  if (!flow) {
    return Response.json({ error: "Flow not found" }, { status: 404 });
  }

  let code: string;
  let manifest: { triggers: { nodeId: string; kind: string; functionName: string; details: Record<string, unknown> }[] };
  try {
    const graph = deserializeGraph(body.graph);
    ({ code, manifest } = compileGraph(graph, flow.version, flow.revision));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Compile error: ${message}` }, { status: 400 });
  }

  writeDeployedScriptFile(flowId, code);
  const deployed = db.upsertDeployedScript({ projectId, flowId, flowName: flow.name, code, manifest, version: flow.version, revision: flow.revision });

  await fireOnDeployEvent(db, deployed);

  return Response.json({ manifest: deployed.manifest, version: deployed.version, revision: deployed.revision, deployedAt: deployed.deployedAt });
}

export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const deployed = getDatabaseManager().getDeployedScript(flowId);
  if (!deployed || deployed.projectId !== projectId) {
    return Response.json({ error: "This Flow hasn't been deployed yet." }, { status: 404 });
  }
  return Response.json(deployed);
}
