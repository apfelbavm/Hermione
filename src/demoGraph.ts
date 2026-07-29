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
  const graph = new Graph("demo", "Interview Scheduling Demo");

  const start = addNode(graph, "event.run", { x: 40, y: 220 }, "start");
  const add = addNode(graph, "math.add", { x: 320, y: 40 }, "add");
  const compare = addNode(graph, "math.equal", { x: 560, y: 40 }, "compare");
  const branch = addNode(graph, "flow.branch", { x: 320, y: 260 }, "branch");
  const delay = addNode(graph, "flow.delay", { x: 600, y: 200 }, "delay");
  const sendEmail = addNode(graph, "action.sendEmailMock", { x: 820, y: 200 }, "sendEmail");
  const printInvited = addNode(graph, "debug.print", { x: 1080, y: 200 }, "printInvited");
  const printFalse = addNode(graph, "debug.print", { x: 600, y: 420 }, "printFalse");

  add.pins.a.value = 2;
  add.pins.b.value = 3;
  compare.pins.b.value = 4;
  delay.pins.duration.value = 500;
  sendEmail.pins.to.value = "candidate@example.com";
  sendEmail.pins.subject.value = "Interview Invitation";
  sendEmail.pins.body.value = "We would like to invite you for an interview.";
  printInvited.pins.message.value = "Invitation sent — interview scheduled";
  printFalse.pins.message.value = "Score too low — sending rejection";

  connectPins(graph, graph.variables, graph.functions, { fromNode: add.id, fromPin: "result", toNode: compare.id, toPin: "a" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: compare.id, fromPin: "result", toNode: branch.id, toPin: "condition" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "true", toNode: delay.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: delay.id, fromPin: "exec-out", toNode: sendEmail.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: sendEmail.id, fromPin: "exec-out", toNode: printInvited.id, toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: branch.id, fromPin: "false", toNode: printFalse.id, toPin: "exec-in" });

  return graph;
}
