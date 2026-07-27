import type { Graph } from "./types";

export function connectionsFrom(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.filter((c) => c.fromNode === nodeId && c.fromPin === pinId);
}

export function connectionTo(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
}
