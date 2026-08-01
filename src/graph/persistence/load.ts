import { Graph } from "../engine/graph";
import { fromDocument, type SavedDocument } from "./schema";

export function deserializeGraph(json: string): Graph {
  const doc = JSON.parse(json) as SavedDocument;
  return fromDocument(doc);
}

export function loadGraphFromFile(file: File): Promise<Graph> {
  return file.text().then(deserializeGraph);
}
