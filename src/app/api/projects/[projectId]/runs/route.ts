import { listRuns } from "../../../../../server/runLogs";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string }>;

export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  return Response.json(listRuns(projectId));
}
