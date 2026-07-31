import { registerNode } from "../engine/registry";

registerNode({
  type: "event.start",
  label: "On Start",
  description: "Fires once when the graph starts running.",
  group: "Events",
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "manual" },
});

registerNode({
  type: "event.interval",
  label: "On Interval",
  description: "Fires repeatedly on a configurable interval, in milliseconds.",
  group: "Events",
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  // Editable in the Details panel when this node is selected, not as a wireable pin — see
  // NodeDef.detailProperties.
  detailProperties: [{ id: "intervalMs", label: "Interval (ms)", type: "number", direction: "input", defaultValue: 5000 }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: {
    kind: "interval",
    describeInstance: (node) => ({ intervalMs: node.pins.intervalMs?.value ?? 5000 }),
  },
});

/** The only node the editor's own Run button fires (see main.ts) — distinct from On Start/On
 * Interval, which describe how a *compiled/deployed* graph gets triggered outside the editor. */
registerNode({
  type: "event.run",
  label: "On Run",
  description: "Fires when the editor's own Run button is pressed.",
  group: "Events",
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "run" },
});
