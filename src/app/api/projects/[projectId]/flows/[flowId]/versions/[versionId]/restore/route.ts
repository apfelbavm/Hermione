import { getDatabaseManager } from "../../../../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string; versionId: string }>;

/** "Restore old version" — see DatabaseManager.restoreFlowVersion's own comment. Returns the
 * updated FlowSummary (now live at the restored content, one version further ahead). */
export async function POST(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId, versionId } = await params;
  const flow = getDatabaseManager().restoreFlowVersion(projectId, flowId, versionId);
  if (!flow) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(flow);
}
