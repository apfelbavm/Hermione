import { registerBuiltins } from "../../../nodes";
import { createExecutionContext, runExecFrom } from "../../../engine/executor";
import { deserializeGraph } from "../../../persistence/load";

// Must run under the Node runtime (not edge) — the interpreter and node implementations
// (node-forge/openpgp for crypto, fetch-based http/odata/oauth2 nodes, etc.) assume a Node
// environment, and streaming a ReadableStream response needs a runtime that doesn't buffer it.
export const runtime = "nodejs";

registerBuiltins();

/** Same visualization pacing the old in-browser Run button used (see the removed
 * STEP_VISUALIZATION_DELAY_MS in main.ts) — kept server-side so every client watching a shared
 * simulation sees the same pacing, and so a fast/slow client connection can't skew it. */
const STEP_VISUALIZATION_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Executes a saved graph's "On Run" entry points server-side, streaming node-start/log/exec-fire/
 * done events back as Server-Sent Events so the browser can drive the same visual highlighting the
 * old client-side interpreter did — with zero execution logic left in the browser. See the
 * "Simulate" button handler in AppShell.tsx for the client side of this. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();

  let graph;
  try {
    graph = deserializeGraph(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Invalid graph: ${message}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let aborted = false;
  request.signal.addEventListener("abort", () => {
    aborted = true;
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, data: unknown): void {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const eventRoots = graph.nodes.filter((n) => n.type === "event.run");
      if (eventRoots.length === 0) {
        send("log", { message: 'No "On Run" node in graph — nothing to run.' });
        send("done", {});
        controller.close();
        return;
      }

      const execCtx = createExecutionContext(graph, {
        log: (message) => send("log", { message }),
        onNodeStart: async (nodeId) => {
          if (aborted) throw new Error("Simulation aborted by client");
          send("node-start", { nodeId });
          await delay(STEP_VISUALIZATION_DELAY_MS);
        },
        onExecFire: (connectionId) => {
          send("exec-fire", { connectionId });
        },
      });

      try {
        for (const root of eventRoots) {
          if (aborted) break;
          await runExecFrom(root.id, "exec-out", execCtx);
        }
      } catch (err) {
        send("log", { message: `Error: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        send("done", {});
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
