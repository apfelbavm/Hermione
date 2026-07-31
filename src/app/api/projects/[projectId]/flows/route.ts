import { createFlow, listFlows } from "../../../../../server/projects";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string }>;

export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  return Response.json(listFlows(projectId));
}

export async function POST(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  const { name } = (await request.json()) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  return Response.json(createFlow(projectId, name.trim()), { status: 201 });
}
