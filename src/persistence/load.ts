import type { Graph } from "../engine/types";
import { fromDocument, LOCAL_STORAGE_KEY, type SavedDocument } from "./schema";

export function deserializeGraph(json: string): Graph {
  const doc = JSON.parse(json) as SavedDocument;
  return fromDocument(doc);
}

export function loadGraphFromLocalStorage(): Graph | null {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return null;
  return deserializeGraph(raw);
}

export function loadGraphFromFile(file: File): Promise<Graph> {
  return file.text().then(deserializeGraph);
}
