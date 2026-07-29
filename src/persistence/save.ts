import { Graph } from "../engine/graph";
import { LOCAL_STORAGE_KEY, toDocument } from "./schema";

export function serializeGraph(graph: Graph): string {
  return JSON.stringify(toDocument(graph), null, 2);
}

export function saveGraphToLocalStorage(graph: Graph): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, serializeGraph(graph));
}

export function downloadGraphAsFile(
  graph: Graph,
  filename: string = `${graph.name || "graph"}.json`,
): void {
  const blob = new Blob([serializeGraph(graph)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
