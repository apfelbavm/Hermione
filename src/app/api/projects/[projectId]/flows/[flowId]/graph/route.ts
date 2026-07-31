import { getDatabaseManager } from "../../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** Split from the parent flow route since this carries the large, frequent (Save button / autosave)
 * payload, distinct from the small/rare rename PATCH there. Body is the raw serializeGraph() JSON
 * text, stored opaquely — see loadFlowGraphJson/saveFlowGraphJson's own comments. */
export async function PUT(request: Request, { params }: { params: Params }): Promise<Response> {
  const { flowId } = await params;
  const graphJson = await request.text();
  getDatabaseManager().saveFlowGraphJson(flowId, graphJson);
  return new Response(null, { status: 204 });
}
