import { getNodeDef } from "./engine/registry";
import { connectPins, createNodeInstance } from "./engine/graphMutations";
import { createEmptyGraph, type Graph } from "./engine/types";

function addNode(graph: Graph, type: string, position: { x: number; y: number }, id: string) {
  const def = getNodeDef(type);
  const node = createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

/** A small hand-built graph used to exercise the renderer/executor before the editor UI exists. */
export function buildDemoGraph(): Graph {
  const graph = createEmptyGraph("demo", "Interview Scheduling Demo");

  const start = addNode(graph, "event.start", { x: 40, y: 220 }, "start");
  const add = addNode(graph, "math.add", { x: 320, y: 40 }, "add");
  const compare = addNode(graph, "math.compare", { x: 560, y: 40 }, "compare");
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

  connectPins(graph, { fromNode: add.id, fromPin: "result", toNode: compare.id, toPin: "a" });
  connectPins(graph, { fromNode: compare.id, fromPin: "result", toNode: branch.id, toPin: "condition" });
  connectPins(graph, { fromNode: start.id, fromPin: "exec-out", toNode: branch.id, toPin: "exec-in" });
  connectPins(graph, { fromNode: branch.id, fromPin: "true", toNode: delay.id, toPin: "exec-in" });
  connectPins(graph, { fromNode: delay.id, fromPin: "exec-out", toNode: sendEmail.id, toPin: "exec-in" });
  connectPins(graph, { fromNode: sendEmail.id, fromPin: "exec-out", toNode: printInvited.id, toPin: "exec-in" });
  connectPins(graph, { fromNode: branch.id, fromPin: "false", toNode: printFalse.id, toPin: "exec-in" });

  return graph;
}
