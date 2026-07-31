import { requestSimulationPause, requestSimulationResume } from "../../../../engine/simulationControl";

// See simulate/route.ts's own comment — same reason this needs the Node runtime.
export const runtime = "nodejs";

/** Pauses or resumes an already-running /api/simulate stream, identified by the runId it sent back
 * in its own "run-start" SSE event — see AppShell.tsx's Pause/Continue toolbar buttons. A plain SSE
 * response has no way to receive more input from the client mid-stream, so this is a second,
 * separate request rather than something sent over the simulate connection itself. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const runId = (body as { runId?: unknown })?.runId;
  const action = (body as { action?: unknown })?.action;
  if (typeof runId !== "string" || (action !== "pause" && action !== "resume")) {
    return new Response(JSON.stringify({ error: 'Body must be { runId: string, action: "pause" | "resume" }' }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const found = action === "pause" ? requestSimulationPause(runId) : requestSimulationResume(runId);
  // Not found just means the run already finished (or the id is stale) — not a client error worth
  // surfacing loudly, since a Pause/Continue click racing the run's own natural end is harmless.
  return new Response(JSON.stringify({ ok: found }), { status: found ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
