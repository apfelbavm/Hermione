import { Graph } from "./engine/graph";
import { nextId } from "./engine/graphMutations";
import { parseClipboardPayload, pasteNodesIntoGraph } from "./engine/clipboard";

// Same "paste a copied NodesClipboardPayload into a fresh Graph" approach as dropboxTemplateGraph.ts
// — this is only ever used to render the Empty tile's thumbnail (see CreateFlowDialog.tsx), not what
// actually gets created when that tile is picked (still a truly empty Graph).
const EMPTY_TEMPLATE_PAYLOAD_JSON = `{"source":"hermione-graph-editor","kind":"nodes","version":1,"nodes":[{"id":"node-3-007mv6","type":"event.run","position":{"x":0,"y":0},"pins":{"exec-out":{}},"disabled":false,"breakpoint":false},{"id":"node-4-bzaa8z","type":"debug.print","position":{"x":320,"y":0},"pins":{"exec-in":{"connectionId":"conn-5-jt08ek"},"message":{"value":"Hello World!"},"exec-out":{}},"disabled":false,"breakpoint":false}],"connections":[{"id":"conn-5-jt08ek","fromNode":"node-3-007mv6","fromPin":"exec-out","toNode":"node-4-bzaa8z","toPin":"exec-in"}]}`;

/** Small "Hello World" example graph used only as the Empty tile's illustration. */
export function buildEmptyTemplateIllustrationGraph(): Graph {
  const payload = parseClipboardPayload(EMPTY_TEMPLATE_PAYLOAD_JSON);
  if (!payload || payload.kind !== "nodes") {
    throw new Error("Invalid Empty template illustration payload");
  }
  const graph = new Graph(nextId("flow-graph"), "");
  const minX = Math.min(...payload.nodes.map((n) => n.position.x));
  const minY = Math.min(...payload.nodes.map((n) => n.position.y));
  pasteNodesIntoGraph(graph, payload, { x: minX, y: minY });
  return graph;
}
