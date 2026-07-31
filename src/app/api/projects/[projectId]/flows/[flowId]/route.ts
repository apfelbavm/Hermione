import { deleteFlow, getFlow, loadFlowGraphJson, renameFlow } from "../../../../../../server/projects";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** Returns the Flow's own summary plus its graph as a raw JSON string (see loadFlowGraphJson's own
 * comment) — the client deserializes it itself via persistence/load.ts's deserializeGraph, exactly
 * as it always has, just fetched from here instead of read out of localStorage. `graphJson: null`
 * means this Flow has never been saved yet — the client falls back to a fresh demo graph. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const flow = getFlow(projectId, flowId);
  if (!flow) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ flow, graphJson: loadFlowGraphJson(flowId) });
}

export async function PATCH(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const { name } = (await request.json()) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  renameFlow(projectId, flowId, name.trim());
  return Response.json(getFlow(projectId, flowId));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  deleteFlow(projectId, flowId);
  return new Response(null, { status: 204 });
}
