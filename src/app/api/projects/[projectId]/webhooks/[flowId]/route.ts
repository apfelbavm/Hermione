import { getDatabaseManager } from "../../../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string; flowId: string }>;

/** This Flow's webhook config plus its recent delivery history — feeds the Webhooks page's
 * per-flow expandable delivery inspector. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const db = getDatabaseManager();
  const config = db.getOrCreateWebhookConfig(flowId, projectId);
  const deliveries = db.listWebhookDeliveries(flowId);
  return Response.json({ config, deliveries });
}
