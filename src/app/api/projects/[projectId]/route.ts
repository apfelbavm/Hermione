import { getDatabaseManager } from "../../../../server/DatabaseManager";
import { deleteDeployedScriptFile } from "../../../../server/deployedScriptFile";

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
  const { name, description } = (await request.json()) as {
    name?: string;
    description?: string;
  };
  const db = getDatabaseManager();
  if (name !== undefined) {
    if (!name.trim()) return Response.json({ error: "name is required" }, { status: 400 });
    db.renameProject(projectId, name.trim());
  }
  if (description !== undefined) {
    db.updateProjectDescription(projectId, description);
  }
  return Response.json(db.getProject(projectId));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId } = await params;
  const db = getDatabaseManager();
  const deployedFlowIds = db.listDeployedScripts(projectId).map((s) => s.flowId);
  db.deleteProject(projectId);
  for (const flowId of deployedFlowIds) deleteDeployedScriptFile(flowId);
  return new Response(null, { status: 204 });
}
