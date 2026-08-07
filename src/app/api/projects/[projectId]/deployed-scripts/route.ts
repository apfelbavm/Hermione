import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string }>;

/** Lists every deployed Flow in this project (see server/models.ts's DeployedScriptSummary) — feeds
 * the Emulate page's picker, which only offers Flows that actually have something
 * deployed to run. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  return Response.json(getDatabaseManager().listDeployedScripts(projectId));
}
