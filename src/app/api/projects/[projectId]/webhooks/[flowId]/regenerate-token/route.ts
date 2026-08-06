import { getDatabaseManager } from "../../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** Issues a brand new bearer token for this Flow's endpoint, invalidating the previous one
 * immediately. The returned config is the only time the plaintext token is ever sent to the
 * browser again — the Webhooks page must show/copy it right after this call, not persist it. */
export async function POST(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const config = getDatabaseManager().regenerateWebhookToken(flowId, projectId);
  return Response.json(config);
}
