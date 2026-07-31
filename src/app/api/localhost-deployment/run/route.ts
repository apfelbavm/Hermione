import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerBuiltins } from "../../../../nodes";
import { compileGraph } from "../../../../compiler/codegen";
import { deserializeGraph } from "../../../../persistence/load";
import { nextId } from "../../../../engine/graphMutations";
import { getDatabaseManager } from "../../../../server/DatabaseManager";
import { applyCredentialEnvVars } from "../../../../server/credentialEnv";
import type { LogEntry, RunLog } from "../../../../server/models";

// Same reasoning as api/simulate/route.ts: dynamic-importing a compiled module and running real
// node implementations (crypto/http/etc.) needs a genuine Node environment, not the edge runtime.
export const runtime = "nodejs";

registerBuiltins();

interface RunProductionRequestBody {
  projectId: string;
  flowId: string;
}

/** Runs a saved Flow's own COMPILED output (see compiler/codegen.ts) — the exact same source a
 * "Compile" click in the editor would download — rather than the INTERPRETED graph api/simulate's
 * route runs. Only "On Start" trigger(s) (manifest kind "manual" — see nodes/event.ts's own doc
 * comment contrasting it with "On Run", which is Simulate-only and never compiled into anything this
 * route would find) fire here, mirroring how a real deployed graph would actually start. Persists the
 * result as a RunLog the same way Simulate does, tagged kind: "production" so the Logs page can tell
 * the two apart. */
export async function POST(request: Request): Promise<Response> {
  let body: RunProductionRequestBody;
  try {
    body = (await request.json()) as RunProductionRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, flowId } = body;
  const db = getDatabaseManager();
  const flow = db.getFlow(projectId, flowId);
  if (!flow) {
    return Response.json({ error: "Flow not found" }, { status: 404 });
  }

  const graphJson = db.loadFlowGraphJson(flowId);
  if (!graphJson) {
    return Response.json({ error: "This Flow has never been saved — nothing to compile/run." }, { status: 400 });
  }

  const entries: LogEntry[] = [];
  function recordLogEntry(message: string): void {
    entries.push({ id: nextId("log"), message, format: "text", timestamp: new Date().toISOString() });
  }

  const startedAt = new Date().toISOString();
  let tempDir: string | null = null;
  try {
    const graph = deserializeGraph(graphJson);
    const { code, manifest } = compileGraph(graph);
    const manualTriggers = manifest.triggers.filter((t) => t.kind === "manual");

    if (manualTriggers.length === 0) {
      recordLogEntry('No "On Start" node in this graph — nothing to run in production mode.');
    } else {
      applyCredentialEnvVars(db);

      tempDir = mkdtempSync(join(tmpdir(), "hermione-deploy-"));
      const file = join(tempDir, "graph.compiled.mjs");
      writeFileSync(file, code, "utf8");
      const url = `${pathToFileURL(file).href}?t=${Date.now()}-${randomUUID()}`;
      // The compiled module's path is only known at request time — never statically resolvable —
      // so bundlers must leave this import() alone and defer it to Node's real ESM loader.
      const compiled = (await import(/* webpackIgnore: true */ url)) as Record<string, unknown>;

      const rt = {
        state: (compiled.createInitialState as () => Record<string, unknown>)(),
        // Unlike the interpreter's ExecutionContext.log(message, format), compiled output's rt.log
        // only ever takes one already-formatted string (see debug.ts's compileExecute, which bakes
        // formatForLog's output into the call site) — so every entry here is plain "text".
        log: (message: string) => recordLogEntry(message),
      };
      for (const trigger of manualTriggers) {
        const fn = compiled[trigger.functionName] as (rt: unknown) => Promise<void>;
        await fn(rt);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordLogEntry(`Error: ${message}`);
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }

  const runLog: RunLog = {
    id: nextId("run"),
    projectId,
    flowId,
    flowName: flow.name,
    startedAt,
    finishedAt: new Date().toISOString(),
    entries,
    kind: "production",
  };
  db.appendRun(runLog);

  return Response.json({ run: runLog });
}
