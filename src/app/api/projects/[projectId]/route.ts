import { getDatabaseManager } from "../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ projectId: string }>;

export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  const project = getDatabaseManager().getProject(projectId);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  const { name } = (await request.json()) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const db = getDatabaseManager();
  db.renameProject(projectId, name.trim());
  return Response.json(db.getProject(projectId));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  getDatabaseManager().deleteProject(projectId);
  return new Response(null, { status: 204 });
}
