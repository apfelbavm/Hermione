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

/** v1 predates user-defined Functions — its saved graphs have no `functions` field at all. */
function migrateV1ToV2(graph: Graph): Graph {
  return { ...graph, functions: graph.functions ?? [] };
}

/** v2 predates the Code node/Scripts — its saved graphs have no `scripts` field at all. */
function migrateV2ToV3(graph: Graph): Graph {
  return { ...graph, scripts: graph.scripts ?? [] };
}

export function fromDocument(doc: SavedDocument): Graph {
  if (doc.formatVersion === 1) {
    return migrateV2ToV3(migrateV1ToV2(doc.graph));
  }
  if (doc.formatVersion === 2) {
    return migrateV2ToV3(doc.graph);
  }
  if (doc.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new Error(`Unsupported save format version ${doc.formatVersion}`);
  }
  return doc.graph;
}
