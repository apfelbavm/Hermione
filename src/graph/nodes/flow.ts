import { registerNode } from "../engine/registry";
import { DELAY_HELPER_SOURCE, EXECUTE_FLOW_IMPORT, compileResultVar, indent } from "../engine/compileUtils";
import { runExecFrom } from "../engine/executor";
import { connectionsFrom } from "../engine/graphQueries";
import type { PinDef } from "../engine/types";
import { NodeInstance } from "../engine/nodeInstance";
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
    { id: "duration", label: i18n.nodes.flow.delay.pin_duration, type: "number", direction: "input", defaultValue: 500 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    await wait(Number(inputs.duration ?? 0));
    return { nextExec: "exec-out" };
  },
  compileHelpers: { delay: DELAY_HELPER_SOURCE },
  compileExecute: ({ inputs, compileFrom }) => [`await delay(Number(${inputs.duration}));`, ...compileFrom("exec-out")],
});

registerNode({
  type: "flow.branch",
  label: i18n.nodes.flow.branch.label,
  description: i18n.nodes.flow.branch.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "condition", label: i18n.nodes.flow.branch.pin_condition, type: "boolean", direction: "input", defaultValue: false },
    { id: "true", label: i18n.nodes.flow.branch.pin_true, type: "exec", direction: "output" },
    { id: "false", label: i18n.nodes.flow.branch.pin_false, type: "exec", direction: "output" },
  ],
  execute: ({ inputs }) => ({ nextExec: inputs.condition ? "true" : "false" }),
  compileExecute: ({ inputs, compileFrom }) => [`if (${inputs.condition}) {`, ...indent(compileFrom("true")), `} else {`, ...indent(compileFrom("false")), `}`],
});

registerNode({
  type: "flow.isValid",
  label: i18n.nodes.flow.isValid.label,
  description: i18n.nodes.flow.isValid.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "object", label: i18n.nodes.flow.isValid.pin_object, type: "object", direction: "input", defaultValue: null },
    { id: "valid", label: i18n.nodes.flow.isValid.pin_valid, type: "exec", direction: "output" },
    { id: "invalid", label: i18n.nodes.flow.isValid.pin_invalid, type: "exec", direction: "output" },
  ],
  execute: ({ inputs }) => ({
    nextExec: inputs.object === undefined || inputs.object === null ? "invalid" : "valid",
  }),
  compileExecute: ({ inputs, compileFrom }) => [`if (${inputs.object} !== undefined && ${inputs.object} !== null) {`, ...indent(compileFrom("valid")), `} else {`, ...indent(compileFrom("invalid")), `}`],
});

const MAX_FOR_LOOP_ITERATIONS = 100_000;

registerNode({
  type: "flow.forLoop",
  label: i18n.nodes.flow.forLoop.label,
  description: i18n.nodes.flow.forLoop.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "start", label: i18n.nodes.__shared.pin_start, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "end", label: i18n.nodes.__shared.pin_end, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "loop-body", label: i18n.nodes.__shared.pin_loop_body, type: "exec", direction: "output" },
    { id: "index", label: i18n.nodes.__shared.pin_index, type: "number", direction: "output" },
    { id: "completed", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
  ],

  disabledNextExec: ["completed"],

  latentBodyPins: () => ["loop-body"],
  execute: async ({ node, inputs, ctx }) => {
    const start = Math.round(Number(inputs.start ?? 0));
    const end = Math.round(Number(inputs.end ?? 0));

    if (end - start + 1 > MAX_FOR_LOOP_ITERATIONS) {
      throw new Error(`For Loop (${node.id}) would run ${end - start + 1} iterations, over the ${MAX_FOR_LOOP_ITERATIONS} limit — check its Start/End.`);
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
    { id: `${THEN_PREFIX}0`, label: `${i18n.nodes.flow.sequence.pin_then} 0`, type: "exec", direction: "output" },
    { id: `${THEN_PREFIX}1`, label: `${i18n.nodes.flow.sequence.pin_then} 1`, type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => [{ id: "exec-in", label: "", type: "exec", direction: "input" }, ...sequenceThenPinDefs(node)],
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
    { id: `${BRANCH_PREFIX}0`, label: `${i18n.nodes.flow.parallel.pin_branch} 0`, type: "exec", direction: "output" },
    { id: `${BRANCH_PREFIX}1`, label: `${i18n.nodes.flow.parallel.pin_branch} 1`, type: "exec", direction: "output" },
    { id: "completed", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
  ],
  deriveInstancePins: (node) => [{ id: "exec-in", label: "", type: "exec", direction: "input" }, ...parallelBranchPinDefs(node), { id: "completed", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" }],
  addInstancePinEntry: (node) => {
    const suffixes = parallelBranchIds(node).map(branchSuffix);
    const nextSuffix = suffixes.length === 0 ? 0 : Math.max(...suffixes) + 1;
    node.pins[`${BRANCH_PREFIX}${nextSuffix}`] = {};
  },

  disabledNextExec: ["completed"],
  latentBodyPins: (node) => parallelBranchIds(node),
  execute: async ({ node, ctx }) => {
    const branchIds = parallelBranchIds(node);
    await Promise.all(branchIds.flatMap((branchId) => connectionsFrom(ctx.graph, node.id, branchId).map((conn) => runExecFrom(conn.toNode, conn.toPin, ctx))));
    return { nextExec: "completed" };
  },

  compileExecute: ({ node, compileFrom }) => {
    const branchBlocks = parallelBranchIds(node).map((branchId) => [`(async () => {`, ...indent(compileFrom(branchId)), `})(),`]);
    return [`await Promise.all([`, ...indent(branchBlocks.flat()), `]);`, ...compileFrom("completed")];
  },
});

registerNode({
  type: "flow.return",
  label: i18n.nodes.flow.return.label,
  description: i18n.nodes.flow.return.description,
  group: "Flow Control",
  pins: [], // real pins are derived per-instance from this node's own outputEntries
  editableOutputs: true,
  deriveInstancePins: (node) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...(node.outputEntries ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      type: entry.type,
      direction: "input" as const,
      defaultValue: entry.defaultValue,
      container: entry.container,
      keyType: entry.keyType,
      subType: entry.subType,
    })),
  ],
  // Values are only ever added/removed via the Details panel's Outputs section (NodeOutputsPanel)
  // — no canvas "+" affordance for this node type.
  // Terminal — no exec-out, same as function.return. Only meaningful to the interpreter as a log
  // line (there's no caller waiting on a return value while Simulating this flow itself in the
  // editor — a real caller only ever sees these values via the DEPLOYED path, see flow.executeFlow
  // /server/executeDeployedFlow.ts). If more than one flow.return instance fires, the last one to
  // run wins — same "most recent write wins" rule function.return's own doc comment already covers.
  execute: ({ inputs, ctx }) => {
    ctx.log(`Flow return: ${JSON.stringify(inputs)}`);
    return {};
  },
  // Assigns straight into the real `let` bindings compiler/codegen.ts's compileGraph declared for
  // each trigger method (see rootGraphOutputEntries/functionOutputNamesByGraph there) — reuses
  // function.return's exact resolveFunctionOutputRef mechanism, since the root graph is registered
  // in that same map the same way a function body is.
  compileExecute: ({ inputs, resolveFunctionOutputRef }) => {
    if (!resolveFunctionOutputRef) throw new Error("flow.return's compileExecute requires resolveFunctionOutputRef (only codegen.ts provides this)");
    return Object.entries(inputs).map(([pinId, expr]) => `${resolveFunctionOutputRef(pinId)} = ${expr};`);
  },
});

registerNode({
  type: "flow.executeFlow",
  label: i18n.nodes.flow.executeFlow.label,
  description: i18n.nodes.flow.executeFlow.description,
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ], // any further input/output pins below are derived per-instance from this node's own inputEntries/outputEntries
  editableOutputs: true,
  // The target Flow's own "On Execute" event (see nodes/event.ts's event.execute) reads these by
  // name — same relationship as event.request's fields to an actual HTTP request's body/query.
  editableInputs: true,
  // Latent: dynamic-imports and awaits the target Flow's own DEPLOYED script (see
  // server/executeDeployedFlow.ts) — genuinely spans real time, same reasoning as Delay/HTTP Request.
  latent: true,
  deriveInstancePins: (node) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...(node.inputEntries ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      type: entry.type,
      direction: "input" as const,
      defaultValue: entry.defaultValue,
      container: entry.container,
      keyType: entry.keyType,
      subType: entry.subType,
    })),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
    ...(node.outputEntries ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      type: entry.type,
      direction: "output" as const,
      container: entry.container,
      keyType: entry.keyType,
      subType: entry.subType,
    })),
  ],
  // Params/outputs are only ever added/removed via the Details panel's Inputs/Outputs sections
  // (NodeInputsPanel/NodeOutputsPanel) — no canvas "+" affordance for this node type.
  execute: async ({ node, inputs, ctx }) => {
    if (!node.targetFlowId || !ctx.executeFlow) {
      return { nextExec: "exec-out", outputs: mappedOutputs(node, false, "Script not compiled, couldn't execute.", {}) };
    }
    const params = Object.fromEntries((node.inputEntries ?? []).map((entry) => [entry.name, inputs[entry.id]]));
    const result = await ctx.executeFlow(node.targetProjectId ?? "", node.targetFlowId, params);
    return { nextExec: "exec-out", outputs: mappedOutputs(node, result.success, result.error, result.outputs) };
  },
  compileExecute: ({ node, inputs, compileFrom }) => {
    const paramsLiteral = `{ ${(node.inputEntries ?? []).map((entry) => `${JSON.stringify(entry.name)}: ${inputs[entry.id]}`).join(", ")} }`;
    return [`const ${compileResultVar(node.id)} = await executeDeployedFlow(${JSON.stringify(node.targetProjectId ?? "")}, ${JSON.stringify(node.targetFlowId ?? "")}, ${paramsLiteral});`, ...compileFrom("exec-out")];
  },
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    const outputs: Record<string, string> = { success: `${v}.success`, error: `${v}.error` };
    for (const entry of node.outputEntries ?? []) {
      outputs[entry.id] = `(${JSON.stringify(entry.name)} in ${v}.outputs ? ${v}.outputs[${JSON.stringify(entry.name)}] : ${JSON.stringify(entry.defaultValue ?? null)})`;
    }
    return outputs;
  },
  compileImports: [EXECUTE_FLOW_IMPORT],
});

/** Turns a runDeployedFlow-shaped result into this node's own pin-id-keyed outputs — mapped by each
 * declared output entry's own NAME (exactly like code.ts's pinOutputsFor matches a Code node's
 * outputs against whatever its script's run() returned), falling back to that entry's own default
 * when the callee's flow.return never declared/set a same-named value. */
function mappedOutputs(node: NodeInstance, success: boolean, error: string, named: Record<string, unknown>): Record<string, unknown> {
  const outputs: Record<string, unknown> = { success, error };
  for (const entry of node.outputEntries ?? []) {
    outputs[entry.id] = entry.name in named ? named[entry.name] : entry.defaultValue;
  }
  return outputs;
}
