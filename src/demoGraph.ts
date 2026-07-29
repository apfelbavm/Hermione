import { getNodeDef } from "./engine/registry";
import { connectPins } from "./engine/graphMutations";
import { Graph } from "./engine/graph";
import { NodeInstance } from "./engine/nodeInstance";

function addNode(graph: Graph, type: string, position: { x: number; y: number }, id: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

/** A small hand-built graph used to exercise the renderer/executor before the editor UI exists. */
export function buildDemoGraph(): Graph {
  const graph = new Graph("demo", "Graph");

  const start = addNode(graph, "event.run", { x: 100, y: 220 }, "start");
  const add = addNode(graph, "math.add", { x: 840, y: 360 }, "add");
  const branch = addNode(graph, "flow.branch", { x: 580, y: 220 }, "branch");
  const delay = addNode(graph, "flow.delay", { x: 1000, y: 220 }, "delay");
  const printInvited = addNode(graph, "debug.print", { x: 1300, y: 220 }, "printInvited");
  const printFalse = addNode(graph, "debug.print", { x: 780, y: 220 }, "printFalse");
  const toStr = addNode(graph, "string.fromNumber", { x: 1060, y: 360 }, "node-7-f6ze52");
  const addForCondition = addNode(graph, "math.add", { x: 100, y: 340 }, "node-14-5k3erf");
  const compare = addNode(graph, "math.equal", { x: 320, y: 340 }, "node-15-aj7zk6");

  add.pins.a.value = 12;
  add.pins.b.value = 3;
  delay.pins.duration.value = 500;
  printFalse.pins.message.value = "Hello World!";
  addForCondition.pins.a.value = 2;
  addForCondition.pins.b.value = 3;
  compare.pins.b.value = 5;

  connectPins(graph, graph.variables, graph.functions, { fromNode: add.id, fromPin: "result", toNode: toStr.id, toPin: "value" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: addForCondition.id, fromPin: "result", toNode: compare.id, toPin: "a" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: compare.id, fromPin: "result", toNode: branch.id, toPin: "condition" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "true", toNode: printFalse.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: printFalse.id, fromPin: "exec-out", toNode: delay.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: delay.id, fromPin: "exec-out", toNode: printInvited.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: toStr.id, fromPin: "result", toNode: printInvited.id, toPin: "message" });

  return graph;
}
