import { registerNode } from "../../engine/registry";
import { DELAY_HELPER_SOURCE, indent } from "../../engine/compileUtils";
import { runExecFrom } from "../../engine/executor";
import { connectionsFrom } from "../../engine/graphQueries";
import type { PinDef } from "../../engine/types";
import { NodeInstance } from "../../engine/nodeInstance";
import { i18n } from "@i18n";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

registerNode({
  type: "flow.delay",
  label: i18n.nodes.flow.delay.label,
  description: i18n.nodes.flow.delay.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "duration",
      label: i18n.nodes.flow.delay.pin_duration,
      type: "number",
      direction: "input",
      defaultValue: 500,
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    await wait(Number(inputs.duration ?? 0));
    return { nextExec: "exec-out" };
  },
  compileHelpers: { delay: DELAY_HELPER_SOURCE },
  compileExecute: ({ inputs, compileFrom }) => [
    `await delay(Number(${inputs.duration}));`,
    ...compileFrom("exec-out"),
  ],
});

registerNode({
  type: "flow.branch",
  label: i18n.nodes.flow.branch.label,
  description: i18n.nodes.flow.branch.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "condition",
      label: i18n.nodes.flow.branch.pin_condition,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    {
      id: "true",
      label: i18n.nodes.flow.branch.pin_true,
      type: "exec",
      direction: "output",
    },
    {
      id: "false",
      label: i18n.nodes.flow.branch.pin_false,
      type: "exec",
      direction: "output",
    },
  ],
  execute: ({ inputs }) => ({ nextExec: inputs.condition ? "true" : "false" }),
  compileExecute: ({ inputs, compileFrom }) => [
    `if (${inputs.condition}) {`,
    ...indent(compileFrom("true")),
    `} else {`,
    ...indent(compileFrom("false")),
    `}`,
  ],
});

registerNode({
  type: "flow.isValid",
  label: i18n.nodes.flow.isValid.label,
  description: i18n.nodes.flow.isValid.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "object",
      label: i18n.nodes.flow.isValid.pin_object,
      type: "object",
      direction: "input",
      defaultValue: null,
    },
    {
      id: "valid",
      label: i18n.nodes.flow.isValid.pin_valid,
      type: "exec",
      direction: "output",
    },
    {
      id: "invalid",
      label: i18n.nodes.flow.isValid.pin_invalid,
      type: "exec",
      direction: "output",
    },
  ],
  execute: ({ inputs }) => ({
    nextExec:
      inputs.object === undefined || inputs.object === null
        ? "invalid"
        : "valid",
  }),
  compileExecute: ({ inputs, compileFrom }) => [
    `if (${inputs.object} !== undefined && ${inputs.object} !== null) {`,
    ...indent(compileFrom("valid")),
    `} else {`,
    ...indent(compileFrom("invalid")),
    `}`,
  ],
});

const MAX_FOR_LOOP_ITERATIONS = 100_000;

registerNode({
  type: "flow.forLoop",
  label: i18n.nodes.flow.forLoop.label,
  description: i18n.nodes.flow.forLoop.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "start",
      label: i18n.nodes.__shared.pin_start,
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    {
      id: "end",
      label: i18n.nodes.__shared.pin_end,
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    {
      id: "loop-body",
      label: i18n.nodes.__shared.pin_loop_body,
      type: "exec",
      direction: "output",
    },
    {
      id: "index",
      label: i18n.nodes.__shared.pin_index,
      type: "number",
      direction: "output",
    },
    {
      id: "completed",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],

  disabledNextExec: ["completed"],

  latentBodyPins: () => ["loop-body"],
  execute: async ({ node, inputs, ctx }) => {
    const start = Math.round(Number(inputs.start ?? 0));
    const end = Math.round(Number(inputs.end ?? 0));

    if (end - start + 1 > MAX_FOR_LOOP_ITERATIONS) {
      throw new Error(
        `For Loop (${node.id}) would run ${end - start + 1} iterations, over the ${MAX_FOR_LOOP_ITERATIONS} limit — check its Start/End.`,
      );
    }

    const bodyTargets = connectionsFrom(ctx.graph, node.id, "loop-body");
    for (let i = start; i <= end; i++) {
      ctx.execOutputs.set(`${node.id}:index`, i);
      for (const conn of bodyTargets) {
        await runExecFrom(conn.toNode, conn.toPin, ctx);
      }
    }

    return { nextExec: "completed" };
  },
});

const THEN_PREFIX = "then-";
const MIN_SEQUENCE_ENTRIES = 1;

function thenSuffix(pinId: string): number {
  return Number(pinId.slice(THEN_PREFIX.length));
}

function sequenceThenIds(node: NodeInstance): string[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(THEN_PREFIX))
    .sort((a, b) => thenSuffix(a) - thenSuffix(b));
}

function sequenceThenPinDefs(node: NodeInstance): PinDef[] {
  const ids = sequenceThenIds(node);
  return ids.map((id, i) => ({
    id,
    label: `${i18n.nodes.flow.sequence.pin_then} ${i}`,
    type: "exec" as const,
    direction: "output" as const,
    removable: ids.length > MIN_SEQUENCE_ENTRIES,
  }));
}

registerNode({
  type: "flow.sequence",
  label: i18n.nodes.flow.sequence.label,
  description: i18n.nodes.flow.sequence.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: `${THEN_PREFIX}0`,
      label: `${i18n.nodes.flow.sequence.pin_then} 0`,
      type: "exec",
      direction: "output",
    },
    {
      id: `${THEN_PREFIX}1`,
      label: `${i18n.nodes.flow.sequence.pin_then} 1`,
      type: "exec",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...sequenceThenPinDefs(node),
  ],
  addInstancePinEntry: (node) => {
    const suffixes = sequenceThenIds(node).map(thenSuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${THEN_PREFIX}${nextSuffix}`] = {};
  },

  disabledNextExec: [],
  latentBodyPins: (node) => sequenceThenIds(node),
  execute: async ({ node, ctx }) => {
    for (const thenId of sequenceThenIds(node)) {
      for (const conn of connectionsFrom(ctx.graph, node.id, thenId)) {
        await runExecFrom(conn.toNode, conn.toPin, ctx);
      }
    }
    return {};
  },
});

const BRANCH_PREFIX = "branch-";
const MIN_PARALLEL_BRANCHES = 1;

function branchSuffix(pinId: string): number {
  return Number(pinId.slice(BRANCH_PREFIX.length));
}

function parallelBranchIds(node: NodeInstance): string[] {
  return Object.keys(node.pins)
    .filter((id) => id.startsWith(BRANCH_PREFIX))
    .sort((a, b) => branchSuffix(a) - branchSuffix(b));
}

function parallelBranchPinDefs(node: NodeInstance): PinDef[] {
  const ids = parallelBranchIds(node);
  return ids.map((id, i) => ({
    id,
    label: `${i18n.nodes.flow.parallel.pin_branch} ${i}`,
    type: "exec" as const,
    direction: "output" as const,
    removable: ids.length > MIN_PARALLEL_BRANCHES,
  }));
}

registerNode({
  type: "flow.parallel",
  label: i18n.nodes.flow.parallel.label,
  description: i18n.nodes.flow.parallel.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: `${BRANCH_PREFIX}0`,
      label: `${i18n.nodes.flow.parallel.pin_branch} 0`,
      type: "exec",
      direction: "output",
    },
    {
      id: `${BRANCH_PREFIX}1`,
      label: `${i18n.nodes.flow.parallel.pin_branch} 1`,
      type: "exec",
      direction: "output",
    },
    {
      id: "completed",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],
  deriveInstancePins: (node) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...parallelBranchPinDefs(node),
    {
      id: "completed",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
  ],
  addInstancePinEntry: (node) => {
    const suffixes = parallelBranchIds(node).map(branchSuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${BRANCH_PREFIX}${nextSuffix}`] = {};
  },

  disabledNextExec: ["completed"],
  latentBodyPins: (node) => parallelBranchIds(node),
  execute: async ({ node, ctx }) => {
    const branchIds = parallelBranchIds(node);
    await Promise.all(
      branchIds.flatMap((branchId) =>
        connectionsFrom(ctx.graph, node.id, branchId).map((conn) =>
          runExecFrom(conn.toNode, conn.toPin, ctx),
        ),
      ),
    );
    return { nextExec: "completed" };
  },

  compileExecute: ({ node, compileFrom }) => {
    const branchBlocks = parallelBranchIds(node).map((branchId) => [
      `(async () => {`,
      ...indent(compileFrom(branchId)),
      `})(),`,
    ]);
    return [
      `await Promise.all([`,
      ...indent(branchBlocks.flat()),
      `]);`,
      ...compileFrom("completed"),
    ];
  },
});
