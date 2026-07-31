import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

registerNode({
  type: "event.start",
  label: i18n.nodes.event.start.label,
  description: i18n.nodes.event.start.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "manual" },
});

registerNode({
  type: "event.interval",
  label: i18n.nodes.event.interval.label,
  description: i18n.nodes.event.interval.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  // Editable in the Details panel when this node is selected, not as a wireable pin — see
  // NodeDef.detailProperties.
  detailProperties: [
    {
      id: "intervalMs",
      label: i18n.nodes.event.interval.pin_interval_ms,
      type: "number",
      direction: "input",
      defaultValue: 5000,
    },
  ],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: {
    kind: "interval",
    describeInstance: (node) => ({
      intervalMs: node.pins.intervalMs?.value ?? 5000,
    }),
  },
});

/** The only node the editor's own Run button fires (see main.ts) — distinct from On Start/On
 * Interval, which describe how a *compiled/deployed* graph gets triggered outside the editor. */
registerNode({
  type: "event.run",
  label: i18n.nodes.event.run.label,
  description: i18n.nodes.event.run.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "run" },
});
