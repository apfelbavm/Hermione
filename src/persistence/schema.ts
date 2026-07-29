import { Graph } from "../engine/graph";

export const CURRENT_FORMAT_VERSION = 3;
export const LOCAL_STORAGE_KEY = "hermione:last-graph";

export interface SavedDocument {
  formatVersion: number;
  graph: Graph;
}

export function toDocument(graph: Graph): SavedDocument {
  return { formatVersion: CURRENT_FORMAT_VERSION, graph };
}

/** v1 (predates user-defined Functions) and v2 (predates the Code node/Scripts) saves are simply
 * missing the `functions`/`scripts` fields — reviveGraph below already defaults every field
 * unconditionally, so that defaulting IS the migration; no format ever renamed or restructured a
 * field, which is the only thing that would require version-specific logic beyond it. */
const SUPPORTED_FORMAT_VERSIONS = [1, 2, CURRENT_FORMAT_VERSION];

/** `doc.graph` (and every function's `body`) is a plain object fresh out of JSON.parse, not a real
 * `Graph` instance — it has none of Graph.prototype's methods (e.g. getVisibleVariables). Rebuilds
 * a proper instance, recursively, so the loaded graph behaves identically to one built with `new
 * Graph(...)`. */
function reviveGraph(graph: Graph): Graph {
  const revived = new Graph(graph.id, graph.name);
  revived.nodes = graph.nodes ?? [];
  revived.connections = graph.connections ?? [];
  revived.variables = graph.variables ?? [];
  revived.commentBoxes = graph.commentBoxes ?? [];
  revived.scripts = graph.scripts ?? [];
  revived.functions = (graph.functions ?? []).map((fn) => ({
    ...fn,
    body: reviveGraph(fn.body),
  }));
  return revived;
}

export function fromDocument(doc: SavedDocument): Graph {
  if (!SUPPORTED_FORMAT_VERSIONS.includes(doc.formatVersion)) {
    throw new Error(`Unsupported save format version ${doc.formatVersion}`);
  }
  return reviveGraph(doc.graph);
}
