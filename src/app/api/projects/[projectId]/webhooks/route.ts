import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string }>;

/** Every deployed Flow with an "On HTTP Request" trigger in this project, each combined with its
 * webhook security config — feeds the Webhooks page's list (see DatabaseManager.listWebhookFlows). */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  return Response.json(getDatabaseManager().listWebhookFlows(projectId));
}
