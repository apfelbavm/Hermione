import { getDatabaseManager } from "../../../../../../server/DatabaseManager";
import { deleteDeployedScriptFile } from "../../../../../../server/deployedScriptFile";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** Returns the Flow's own summary plus its graph as a raw JSON string (see loadFlowGraphJson's own
 * comment) — the client deserializes it itself via persistence/load.ts's deserializeGraph, exactly
 * as it always has, just fetched from here instead of read out of localStorage. `graphJson: null`
 * means this Flow has never been saved yet — the client falls back to a fresh demo graph. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const db = getDatabaseManager();
  const flow = db.getFlow(projectId, flowId);
  if (!flow) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ flow, graphJson: db.loadFlowGraphJson(flowId) });
}

export async function PATCH(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const { name } = (await request.json()) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const db = getDatabaseManager();
  db.renameFlow(projectId, flowId, name.trim());
  return Response.json(db.getFlow(projectId, flowId));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  getDatabaseManager().deleteFlow(projectId, flowId);
  deleteDeployedScriptFile(flowId);
  return new Response(null, { status: 204 });
}
