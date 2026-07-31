import { registerNode } from "../engine/registry";
import { DELAY_HELPER_SOURCE, indent } from "../engine/compileUtils";
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

// A runaway Start/End (typo'd or wired to the wrong value) shouldn't be able to hang the whole
// tab — same philosophy as executor.ts's MAX_EXEC_STEPS/MAX_CALL_DEPTH, just for loop iterations.
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
  // Disabled must skip straight to "completed" — never firing "loop-body" — rather than the
  // generic disabled behavior of firing every exec-out pin (which would run the body once, an
  // actual loop node's body isn't a plain continuation). See NodeDef.disabledNextExec.
  disabledNextExec: ["completed"],
  // For Loop isn't itself unconditionally latent (a body with no Delay/HTTP Request/etc. completes
  // within one tick), but if its body DOES contain one, this node shows the clock icon too — same
  // reasoning as a Function containing a latent node. See NodeDef.latentBodyPins/latency.ts.
  latentBodyPins: () => ["loop-body"],
  // Runs the ENTIRE chain wired to "loop-body" to completion once per index from Start up to AND
  // INCLUDING End, awaiting each iteration before starting the next — mirrors function.call
  // awaiting runFunctionCall, just walking a chain in this SAME graph instead of a function's body.
  // "index" is exposed the same way any other exec node exposes an output: written to
  // ctx.execOutputs before each iteration's body runs, so anything wired to Loop Body can read it
  // via the normal input-pin resolution machinery.
  execute: async ({ node, inputs, ctx }) => {
    // Rounded here too (not just at the literal-input widget, see PinDef.integer) since a wired
    // Start/End can come from any number-producing node, not only a literal the user typed.
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
  // Compiler support (compileExecute/compileEvaluate) is intentionally out of scope for now — same
  // call as function.entry/return/call in function.ts. Compiling a graph containing one throws the
  // existing "no compileExecute"/"no compileEvaluate" error, an honest failure mode until it lands.
});

// --- Sequence: Unreal-style ordered fan-out — one exec input, N exec outputs ("Then 0", "Then 1",
// ...), expandable via the canvas "+" affordance exactly like Append String's string slots (see
// string.ts) — the NodeInstance's own pins ARE the source of truth for how many "then-N" pins
// exist. Each one's ENTIRE downstream chain is awaited to completion before the next starts —
// this needs its own execute() (rather than just returning `nextExec: [...all of them]`) because
// runExecFrom's shared FIFO queue would otherwise interleave multiple Then branches breadth-first
// instead of running each one all the way through first, same reasoning as For Loop's body.

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
  // Disabled means "run none of the Then branches" — the generic disabled behavior (fire every
  // exec-out pin) would instead run every branch once, which is exactly backwards for a node whose
  // whole purpose IS running its branches; there's nothing else to "continue to" from a Sequence
  // either way (it has no pin analogous to For Loop's "completed"). See NodeDef.disabledNextExec.
  disabledNextExec: [],
  // Latent only if one of its branches is — same reasoning as For Loop. See NodeDef.latentBodyPins.
  latentBodyPins: (node) => sequenceThenIds(node),
  execute: async ({ node, ctx }) => {
    for (const thenId of sequenceThenIds(node)) {
      for (const conn of connectionsFrom(ctx.graph, node.id, thenId)) {
        await runExecFrom(conn.toNode, conn.toPin, ctx);
      }
    }
    return {};
  },
  // Compiler support is intentionally out of scope for now — same call as For Loop/Array,Set,Map
  // For Each (no compileExecute yet). Disabling still compiles fine regardless (see codegen.ts's
  // disabled branch, which never needs the node's own compileExecute).
});

// --- Parallel: fan-out into N branches ("Branch 0", "Branch 1", ...) that all start at once
// instead of Sequence's one-at-a-time ordering — kicked off together via Promise.all rather than
// awaited one by one, so a Delay (or any other latent node) partway down one branch no longer
// blocks the others from making progress meanwhile. Fires the fixed "Completed" pin once every
// branch's entire chain has finished, regardless of which one took longest — same shape as
// JS's own Promise.all, just over runExecFrom chains instead of promises directly.
//
// Note on shared state: every branch's runExecFrom call shares the SAME ExecutionContext (same
// ctx.tickCache/ctx.execOutputs) rather than getting an isolated child context, exactly like
// Sequence's branches and For Loop's body already do — a node reachable from more than one branch
// (or wired into by two branches that reconverge downstream) can run more than once or have its
// per-tick cache cleared mid-flight by a sibling branch, same as Unreal's own docs warn is
// undefined behavior for parallel nodes whose branches reconverge. Not solved here; well-formed
// graphs (branches that don't share downstream nodes) are unaffected since pure evaluate() results
// are deterministic regardless of how many times tickCache gets cleared between reads.

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
  // Disabled must skip straight to "completed" — never firing any branch — same reasoning as For
  // Loop: "completed" is a genuine continuation point distinct from the branches themselves (unlike
  // Sequence, which has no such pin and so fires nothing at all when disabled). See
  // NodeDef.disabledNextExec.
  disabledNextExec: ["completed"],
  // Latent if ANY branch is — same reasoning as Sequence/For Loop. See NodeDef.latentBodyPins.
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
  // Compiles to a native `await Promise.all([...])` wrapping one async IIFE per branch — the same
  // shape as the interpreter's own Promise.all-over-runExecFrom, one level up: each IIFE's body is
  // that branch's own compiled statements (which may themselves contain further `await`s, e.g. from
  // a compiled Delay), so the compiled output genuinely interleaves branches at runtime rather than
  // just simulating it inside the editor.
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
