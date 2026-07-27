import { registerNode } from "../engine/registry";

function nameOf(node: { pins: Record<string, { value?: unknown }> }, fallback: string): string {
  const value = node.pins.name?.value;
  return typeof value === "string" && value.trim() ? value : fallback;
}

registerNode({
  type: "event.start",
  label: "On Start",
  category: "Events",
  pins: [
    { id: "name", label: "Name", type: "string", direction: "input", defaultValue: "Start" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: {
    kind: "manual",
    describeInstance: (node) => ({ name: nameOf(node, "Start") }),
  },
});

registerNode({
  type: "event.interval",
  label: "On Interval",
  category: "Events",
  pins: [
    { id: "name", label: "Name", type: "string", direction: "input", defaultValue: "Interval" },
    { id: "intervalMs", label: "Interval (ms)", type: "number", direction: "input", defaultValue: 5000 },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: () => ({ nextExec: "exec-out" }),
  eventTrigger: {
    kind: "interval",
    describeInstance: (node) => ({
      name: nameOf(node, "Interval"),
      intervalMs: node.pins.intervalMs?.value ?? 5000,
    }),
  },
});
