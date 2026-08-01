import { randomUUID } from "node:crypto";
import { registerBuiltins } from "../../../graph/nodes";
import { createExecutionContext, runExecFrom } from "../../../graph/engine/executor";
import { deserializeGraph } from "../../../graph/persistence/load";
import { checkpointSimulation, disposeSimulationRun, registerSimulationRun, requestSimulationResume } from "../../../graph/engine/simulationControl";
import { allGraphs, nextId } from "../../../graph/engine/graphMutations";
import type { Graph } from "../../../graph/engine/graph";
import type { LogFormat } from "../../../graph/engine/types";
import { getDatabaseManager } from "../../../server/DatabaseManager";
import { executeDeployedFlow } from "../../../server/executeDeployedFlow";
import type { LogEntry, RunLog } from "../../../server/models";

// Must run under the Node runtime (not edge) — the interpreter and node implementations
// (node-forge/openpgp for crypto, fetch-based http/odata/oauth2 nodes, etc.) assume a Node
// environment, and streaming a ReadableStream response needs a runtime that doesn't buffer it.
export const runtime = "nodejs";

registerBuiltins();

/** Same visualization pacing the old in-browser Run button used (see the removed
 * STEP_VISUALIZATION_DELAY_MS in main.ts) — kept server-side so every client watching a shared
 * simulation sees the same pacing, and so a fast/slow client connection can't skew it. */
const SIMULATION_STEP_DELAY_MS = 750;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SimulateRequestBody {
  graph: string;
  projectId: string;
  flowId: string;
  flowName: string;
}

/** Executes a saved graph's "On Run" entry points server-side, streaming node-start/log/exec-fire/
 * done events back as Server-Sent Events so the browser can drive the same visual highlighting the
 * old client-side interpreter did — with zero execution logic left in the browser. See the
 * "Simulate" button handler in AppShell.tsx for the client side of this. Also persists the run's own
 * log output as a RunLog (see server/DatabaseManager.ts's appendRun) — this is the only place a run's logs are actually
 * produced, so it's the natural place to record them, rather than the client reconstructing and
 * re-posting them after the fact. */
export async function POST(request: Request): Promise<Response> {
  let body: SimulateRequestBody;
  let graph: Graph;
  try {
    body = (await request.json()) as SimulateRequestBody;
    graph = deserializeGraph(body.graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Invalid request: ${message}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { projectId, flowId, flowName } = body;
  const db = getDatabaseManager();

  const runId = randomUUID();
  registerSimulationRun(runId);

  const currentFlow = db.getFlow(projectId, flowId);
  const runLog: RunLog = { id: nextId("run"), projectId, flowId, flowName, startedAt: new Date().toISOString(), entries: [], kind: "simulate", revision: currentFlow?.revision, version: currentFlow?.version };
  function recordLogEntry(message: string, format: LogFormat = "text"): void {
    const entry: LogEntry = { id: nextId("log"), message, format, timestamp: new Date().toISOString() };
    runLog.entries.push(entry);
  }

  let aborted = false;
  request.signal.addEventListener("abort", () => {
    aborted = true;
    requestSimulationResume(runId); // wake a paused run so it can notice `aborted` and unwind
  });

  // Every graph a node could live in (root + every function body) — a node-start's nodeId might
  // belong to a function whose tab isn't even open client-side, so breakpoint lookups have to
  // search all of them, not just the root graph.
  const graphsById = new Map<string, Graph>();
  for (const g of allGraphs(graph)) {
    for (const node of g.nodes) graphsById.set(node.id, g);
  }
  function findNodeById(nodeId: string) {
    return graphsById.get(nodeId)?.nodes.find((n) => n.id === nodeId);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, data: unknown): void {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      send("run-start", { runId });

      const eventRoots = graph.nodes.filter((n) => n.type === "event.run");
      if (eventRoots.length === 0) {
        const message = 'No "On Run" node in graph — nothing to run.';
        send("log", { message });
        recordLogEntry(message);
        send("done", {});
        runLog.finishedAt = new Date().toISOString();
        db.appendRun(runLog);
        disposeSimulationRun(runId);
        controller.close();
        return;
      }

      const execCtx = createExecutionContext(graph, {
        log: (message, format) => {
          send("log", { message, format });
          recordLogEntry(message, format);
        },
        getCredential: (name) => db.getCredentialByName(name),
        executeFlow: (targetProjectId, targetFlowId, params) => executeDeployedFlow(targetProjectId, targetFlowId, params),
        onNodeStart: async (nodeId) => {
          if (aborted) throw new Error("Simulation aborted by client");
          send("node-start", { nodeId });

          const atBreakpoint = !!findNodeById(nodeId)?.breakpoint;
          const { willPause, ready } = checkpointSimulation(runId, atBreakpoint);
          if (willPause) send("paused", { nodeId });
          await ready;
          if (aborted) throw new Error("Simulation aborted by client");
          if (willPause) send("resumed", {});

          await delay(SIMULATION_STEP_DELAY_MS);
        },
        onExecFire: (connectionId) => {
          send("exec-fire", { connectionId });
        },
        onPinValues: (nodeId, values) => {
          if (Object.keys(values).length > 0) send("pin-values", { nodeId, values });
        },
      });

      try {
        for (const root of eventRoots) {
          if (aborted) break;
          await runExecFrom(root.id, "exec-out", execCtx);
        }
      } catch (err) {
        const message = `Error: ${err instanceof Error ? err.message : String(err)}`;
        send("log", { message });
        recordLogEntry(message);
      } finally {
        send("done", {});
        runLog.finishedAt = new Date().toISOString();
        db.appendRun(runLog);
        disposeSimulationRun(runId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
