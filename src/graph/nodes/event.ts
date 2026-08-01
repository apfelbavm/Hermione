import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { addNodeOutputEntry, nextId } from "../engine/graphMutations";
import type { NodeInstance } from "../engine/nodeInstance";
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
  type: "event.run",
  label: i18n.nodes.event.run.label,
  description: i18n.nodes.event.run.description,
  group: "Events",
  colorCategory: NodeColorCategory.Events,
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: { kind: "run" },
});

/** A brand-new request field, seeded the same way flow.ts's addOutputEntry seeds a fresh Execute
 * Flow/Return Flow Values output: an unused "Param_N" name, type "string" (the common case for a
 * request field), its own default value. */
function addRequestFieldEntry(node: NodeInstance): void {
  const entries = node.outputEntries ?? [];
  const taken = new Set(entries.map((e) => e.name));
  let i = entries.length + 1;
  while (taken.has(`Param_${i}`)) i++;
  addNodeOutputEntry(node, { id: nextId("io"), name: `Param_${i}`, type: "string", defaultValue: "" });
}

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
  addInstancePinEntry: addRequestFieldEntry,
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
