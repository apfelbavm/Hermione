import type { Connection, Graph } from "./types";

export function connectionsFrom(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.filter((c) => c.fromNode === nodeId && c.fromPin === pinId);
}

export function connectionTo(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
}

/** Every connection touching this pin, whichever end it's on — unlike connectionTo (which assumes
 * at most one, true for data inputs but not exec inputs, which allow several incoming branches to
 * converge), this returns all of them. Used for the right-click "Break Connection" menu and for
 * Ctrl+drag, which picks up every connection on a pin at once. */
export function connectionsTouchingPin(graph: Graph, nodeId: string, pinId: string): Connection[] {
  return graph.connections.filter(
    (c) => (c.fromNode === nodeId && c.fromPin === pinId) || (c.toNode === nodeId && c.toPin === pinId),
  );
}
