import type { Graph } from "../engine/types";

export const CURRENT_FORMAT_VERSION = 1;
export const LOCAL_STORAGE_KEY = "hermione:last-graph";

export interface SavedDocument {
  formatVersion: number;
  graph: Graph;
}

export function toDocument(graph: Graph): SavedDocument {
  return { formatVersion: CURRENT_FORMAT_VERSION, graph };
}

export function fromDocument(doc: SavedDocument): Graph {
  if (doc.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new Error(`Unsupported save format version ${doc.formatVersion}`);
  }
  return doc.graph;
}
