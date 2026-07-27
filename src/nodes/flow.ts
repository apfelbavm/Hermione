import { registerNode } from "../engine/registry";
import { DELAY_HELPER_SOURCE, indent } from "../engine/compileUtils";
import { runExecFrom } from "../engine/executor";
import { connectionsFrom } from "../engine/graphQueries";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

registerNode({
  type: "flow.delay",
  label: "Delay",
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "duration",
      label: "Duration (ms)",
      type: "number",
      direction: "input",
      defaultValue: 500,
    },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
  ],
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
  label: "Branch",
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "condition",
      label: "Condition",
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    { id: "true", label: "True", type: "exec", direction: "output" },
    { id: "false", label: "False", type: "exec", direction: "output" },
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

// A runaway Start/End (typo'd or wired to the wrong value) shouldn't be able to hang the whole
// tab — same philosophy as executor.ts's MAX_EXEC_STEPS/MAX_CALL_DEPTH, just for loop iterations.
const MAX_FOR_LOOP_ITERATIONS = 100_000;

registerNode({
  type: "flow.forLoop",
  label: "For Loop",
  group: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "start",
      label: "Start",
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    {
      id: "end",
      label: "End",
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    { id: "loop-body", label: "Loop Body", type: "exec", direction: "output" },
    { id: "index", label: "Index", type: "number", direction: "output" },
    { id: "completed", label: "Completed", type: "exec", direction: "output" },
  ],
  // Disabled must skip straight to "completed" — never firing "loop-body" — rather than the
  // generic disabled behavior of firing every exec-out pin (which would run the body once, an
  // actual loop node's body isn't a plain continuation). See NodeDef.disabledNextExec.
  disabledNextExec: ["completed"],
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
