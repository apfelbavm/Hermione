import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(getDatabaseManager().listProjects());
}

export async function POST(request: Request): Promise<Response> {
  const { name } = (await request.json()) as { name?: string };
  if (!name || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  return Response.json(getDatabaseManager().createProject(name.trim()), { status: 201 });
}
