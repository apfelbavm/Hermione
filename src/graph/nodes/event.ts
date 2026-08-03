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

registerNode({
  type: "event.simulate",
  label: i18n.nodes.event.simulate.label,
  description: i18n.nodes.event.simulate.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "simulate" },
});

registerNode({
  type: "event.deploy",
  label: i18n.nodes.event.deploy.label,
  description: i18n.nodes.event.deploy.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "deploy" },
});

registerNode({
  type: "event.request",
  label: i18n.nodes.event.request.label,
  description: i18n.nodes.event.request.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [], // real pins are derived per-instance from this node's own outputEntries
  editableOutputs: true,
  deriveInstancePins: (node) => [
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...(node.outputEntries ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      type: entry.type,
      direction: "output" as const,
      defaultValue: entry.defaultValue,
      container: entry.container,
      keyType: entry.keyType,
      subType: entry.subType,
    })),
  ],
  // Fields are only ever added/removed via the Details panel's Outputs section (NodeOutputsPanel)
  // — no canvas "+" affordance for this node type.
  // Simulating locally has no real HTTP request to read from — each declared field just reports
  // its own default value, same as any other not-yet-fed data pin.
  execute: ({ node }) => ({
    nextExec: "exec-out",
    outputs: Object.fromEntries((node.outputEntries ?? []).map((entry) => [entry.id, entry.defaultValue])),
  }),
  eventTrigger: {
    kind: "request",
    // The deployed hooks route (see api/hooks/[projectId]/[flowId]/route.ts) reads this to know
    // which request fields (by name, in this exact order) to parse and pass positionally to the
    // compiled trigger method — see codegen.ts's eventTriggerArgNamesByNode.
    describeInstance: (node) => ({
      params: (node.outputEntries ?? []).map((entry) => ({ name: entry.name, type: entry.type, defaultValue: entry.defaultValue ?? null })),
    }),
  },
});

registerNode({
  type: "event.execute",
  label: i18n.nodes.event.execute.label,
  description: i18n.nodes.event.execute.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [], // real pins are derived per-instance from this node's own outputEntries
  editableOutputs: true,
  deriveInstancePins: (node) => [
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...(node.outputEntries ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      type: entry.type,
      direction: "output" as const,
      defaultValue: entry.defaultValue,
      container: entry.container,
      keyType: entry.keyType,
      subType: entry.subType,
    })),
  ],
  // Fields are only ever added/removed via the Details panel's Outputs section (NodeOutputsPanel)
  // — no canvas "+" affordance for this node type.
  // Simulating locally has no real calling Flow to read from — each declared field just reports
  // its own default value, same as event.request.
  execute: ({ node }) => ({
    nextExec: "exec-out",
    outputs: Object.fromEntries((node.outputEntries ?? []).map((entry) => [entry.id, entry.defaultValue])),
  }),
  eventTrigger: {
    kind: "execute",
    // server/executeDeployedFlow.ts reads this the same way the hooks route reads event.request's
    // own params — by name, in this exact order — to pass positionally to the compiled trigger
    // method (see codegen.ts's eventTriggerArgNamesByNode). A chained call has no caller-supplied
    // values of its own (unlike an HTTP request's body/query), so every field is always fed its
    // own declared default.
    describeInstance: (node) => ({
      params: (node.outputEntries ?? []).map((entry) => ({ name: entry.name, type: entry.type, defaultValue: entry.defaultValue ?? null })),
    }),
  },
});
