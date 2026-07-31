import { getDatabaseManager } from "../../../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string; versionId: string }>;

/** One archived version's full content (graph included) — feeds the "Restore old version" page's
 * read-only graph view once the user picks a version from the dropdown. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { flowId, versionId } = await params;
  const version = getDatabaseManager().getFlowVersion(flowId, versionId);
  if (!version) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(version);
}
