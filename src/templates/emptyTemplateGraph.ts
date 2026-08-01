import { Graph } from "../graph/engine/graph";
import { nextId } from "../graph/engine/graphMutations";
import { parseClipboardPayload, pasteNodesIntoGraph } from "../graph/engine/clipboard";
import emptyTemplateGraph from "./emptyTemplateGraph.json";

export function buildEmptyTemplateIllustrationGraph(): Graph {
  const payload = parseClipboardPayload(JSON.stringify(emptyTemplateGraph));
  if (!payload || payload.kind !== "nodes") {
    throw new Error("Invalid Empty template illustration payload");
  }
  const graph = new Graph(nextId("flow-graph"), "");
  const minX = Math.min(...payload.nodes.map((n) => n.position.x));
  const minY = Math.min(...payload.nodes.map((n) => n.position.y));
  pasteNodesIntoGraph(graph, payload, { x: minX, y: minY });
  return graph;
}
