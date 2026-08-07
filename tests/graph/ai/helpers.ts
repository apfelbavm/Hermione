import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import { getNodeDef } from "@hermione/graph/engine/registry";

export function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

export function buildTestGraph(name = "Test Graph"): Graph {
  return new Graph("graph-1", name);
}
