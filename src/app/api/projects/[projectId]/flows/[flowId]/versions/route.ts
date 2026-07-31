import { getDatabaseManager } from "../../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** "Save new version" — archives the Flow's current state and bumps its live version number (see
 * DatabaseManager.saveNewFlowVersion's own comment). Returns the updated FlowSummary. */
export async function POST(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const flow = getDatabaseManager().saveNewFlowVersion(projectId, flowId);
  if (!flow) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(flow);
}
