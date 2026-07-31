import { Graph } from "../engine/graph";
import { nextId } from "../engine/graphMutations";
import { parseClipboardPayload, pasteNodesIntoGraph } from "../engine/clipboard";
import dropboxTemplateGraph from "./dropboxTemplateGraph.json";

export function buildDropboxTemplateGraph(): Graph {
  const payload = parseClipboardPayload(JSON.stringify(dropboxTemplateGraph));
  if (!payload || payload.kind !== "nodes") {
    throw new Error("Invalid Dropbox template payload");
  }
  const graph = new Graph(nextId("flow-graph"), "");
  const minX = Math.min(...payload.nodes.map((n) => n.position.x));
  const minY = Math.min(...payload.nodes.map((n) => n.position.y));
  pasteNodesIntoGraph(graph, payload, { x: minX, y: minY });
  return graph;
}
