import { NodeInstance } from "../engine/nodeInstance";
import { registerNode } from "../engine/registry";
import type { PinDef, PinType } from "../engine/types";

// Unreal-style "reroute"/"knot" nodes — purely organizational, no logic of their own: whatever
// flows into "in" comes back out of "out" unchanged. Two variants because exec isn't a
// per-instance-configurable PinType the way data pins are (see NodeInstance.elementType/
// container/mapKeyType) — core.reroute handles every DATA pin shape (single/array/set/map, any
// element type), core.rerouteExec is a much simpler passthrough for exec wires. Both are created
// exclusively by splicing an existing wire (see graphMutations.ts's insertRerouteOnConnection,
// wired to the canvas's right-click-on-a-wire menu in main.ts) — with no wire to read a concrete
// type off of, there'd be no sensible default type to hand one dropped fresh from the node-search
// palette, so neither is offered there.
//
// Rendered as a small unlabeled "knot" rather than a full node box (see NodeDef.compact,
// layout.ts, drawNodes.ts) — same look as Unreal's reroute nodes.

function rerouteElementType(node: NodeInstance): PinType {
  return node.elementType ?? "object";
}

function reroutePinDef(
  node: NodeInstance,
  id: string,
  direction: "input" | "output",
): PinDef {
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
  label: "Reroute",
  description: "Bends a wire's path on the canvas with no effect on behavior.",
  group: "Internal",
  compact: true,
  pins: [
    { id: "in", label: "", type: "object", direction: "input" },
    { id: "out", label: "", type: "object", direction: "output" },
  ],
  deriveInstancePins: (node) => [
    reroutePinDef(node, "in", "input"),
    reroutePinDef(node, "out", "output"),
  ],
  evaluate: ({ inputs }) => ({ out: inputs.in }),
  compileEvaluate: ({ inputs }) => ({ out: inputs.in }),
});

registerNode({
  type: "core.rerouteExec",
  label: "Reroute",
  description: "Bends an exec wire's path on the canvas with no effect on behavior.",
  group: "Internal",
  compact: true,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: () => ({ nextExec: "exec-out" }),
  compileExecute: ({ compileFrom }) => compileFrom("exec-out"),
});
