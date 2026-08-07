import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";

export const runtime = "nodejs";

/** Every run across every project (see DatabaseManager.listAllRuns) — feeds the global Logs page,
 * as opposed to /api/projects/[projectId]/runs, which is scoped to one project. */
export async function GET(): Promise<Response> {
  return Response.json(getDatabaseManager().listAllRuns());
}
