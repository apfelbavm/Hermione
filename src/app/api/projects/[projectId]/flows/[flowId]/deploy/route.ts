import { registerBuiltins } from "../../../../../../../nodes";
import { compileGraph } from "../../../../../../../compiler/codegen";
import { deserializeGraph } from "../../../../../../../persistence/load";
import { getDatabaseManager } from "../../../../../../../server/DatabaseManager";
import { writeDeployedScriptFile } from "../../../../../../../server/deployedScriptFile";

export const runtime = "nodejs";

registerBuiltins();

type Params = Promise<{ projectId: string; flowId: string }>;

interface DeployRequestBody {
  graph: string;
}

/** The editor's "Deploy" button (see AppShell.tsx's onCompileClick) — compiles whatever graph the
 * client currently has open (same as the old client-only downloadCompiledGraph, just now also
 * persisted server-side) and stores it as this Flow's one DeployedScript row (see
 * DatabaseManager.upsertDeployedScript), replacing any previous deployment for this Flow. Also
 * materializes the compiled source to a real file under this project's own directory tree (see
 * server/deployedScriptFile.ts) so api/emulate/run/route.ts can actually `import()` it.
 * Returns the compiled `code`/`manifest` so the client can still trigger its own file download from
 * the exact same bytes just persisted, without compiling the graph a second time. */
export async function POST(request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;

  let body: DeployRequestBody;
  try {
    body = (await request.json()) as DeployRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDatabaseManager();
  const flow = db.getFlow(projectId, flowId);
  if (!flow) {
    return Response.json({ error: "Flow not found" }, { status: 404 });
  }

  let code: string;
  let manifest: { triggers: { nodeId: string; kind: string; functionName: string; details: Record<string, unknown> }[] };
  try {
    const graph = deserializeGraph(body.graph);
    ({ code, manifest } = compileGraph(graph));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Compile error: ${message}` }, { status: 400 });
  }

  writeDeployedScriptFile(flowId, code);
  const deployed = db.upsertDeployedScript({ projectId, flowId, flowName: flow.name, code, manifest });

  return Response.json({ code, manifest: deployed.manifest, version: deployed.version, deployedAt: deployed.deployedAt });
}

/** The Emulate page's script viewer (see app/emulate/page.tsx) — reads back the currently deployed
 * snapshot for this Flow, `code` included, unlike the deployed-scripts LISTING route (see
 * ../../deployed-scripts/route.ts), which deliberately omits it (see DeployedScriptSummary's own
 * doc comment). */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { projectId, flowId } = await params;
  const deployed = getDatabaseManager().getDeployedScript(flowId);
  if (!deployed || deployed.projectId !== projectId) {
    return Response.json({ error: "This Flow hasn't been deployed yet." }, { status: 404 });
  }
  return Response.json(deployed);
}
