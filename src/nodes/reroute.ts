import { NodeInstance } from "../engine/nodeInstance";
import { registerNode } from "../engine/registry";
import type { PinDef, PinType } from "../engine/types";
import { i18n } from "@i18n";

function rerouteElementType(node: NodeInstance): PinType {
  return node.elementType ?? "object";
}

function reroutePinDef(node: NodeInstance, id: string, direction: "input" | "output"): PinDef {
  return {
    id,
    label: "",
    type: rerouteElementType(node),
    direction,
    container: node.container,
    keyType: node.mapKeyType,
  };
}

registerNode({
  type: "core.reroute",
  label: i18n.nodes.reroute.data.label,
  description: i18n.nodes.reroute.data.description,
  group: "Internal",
  compact: true,
  pins: [
    { id: "in", label: "", type: "object", direction: "input" },
    { id: "out", label: "", type: "object", direction: "output" },
  ],
  deriveInstancePins: (node) => [reroutePinDef(node, "in", "input"), reroutePinDef(node, "out", "output")],
  evaluate: ({ inputs }) => ({ out: inputs.in }),
  compileEvaluate: ({ inputs }) => ({ out: inputs.in }),
});

registerNode({
  type: "core.rerouteExec",
  label: i18n.nodes.reroute.exec.label,
  description: i18n.nodes.reroute.exec.description,
  group: "Internal",
  compact: true,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: () => ({ nextExec: "exec-out" }),
  compileExecute: ({ compileFrom }) => compileFrom("exec-out"),
});
