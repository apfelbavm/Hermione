import { runFunctionCall } from "../engine/executor";
import { registerNode } from "../engine/registry";

// Compiler support (compileExecute/compileEvaluate) for these three node types is intentionally
// out of scope for now — interpreter + editor first. Compiling a graph containing one throws the
// existing "no compileExecute" error, which is an honest, clear failure mode until that lands.

registerNode({
  type: "function.entry",
  label: "Entry",
  group: "Functions",
  pins: [], // real pins are derived per-instance from the owning FunctionDef's inputs
  deriveFunctionPins: (fn) => [
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...fn.inputs.map((input) => ({
      id: input.id,
      label: input.name,
      type: input.type,
      direction: "output" as const,
    })),
  ],
  execute: () => ({ nextExec: "exec-out" }),
  // Each declared input surfaces here as an output pin, sourced from the current call's resolved
  // arguments — ctx.entryArgs is already keyed by the same PinSignatureEntry ids as these pins.
  evaluate: ({ ctx }) => ({ ...ctx.entryArgs }),
});

registerNode({
  type: "function.return",
  label: "Return",
  group: "Functions",
  pins: [], // real pins are derived per-instance from the owning FunctionDef's outputs
  deriveFunctionPins: (fn) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...fn.outputs.map((output) => ({
      id: output.id,
      label: output.name,
      type: output.type,
      direction: "input" as const,
      defaultValue: output.defaultValue,
    })),
  ],
  // Terminal — no exec-out. Reports its resolved input values as this call's outputs; if the body
  // forks and reaches more than one Return instance, the last one to fire wins (same "most recent
  // write wins" rule already used for variables/tickCache).
  execute: ({ inputs, ctx }) => {
    ctx.onReturn?.(inputs);
    return {};
  },
});

registerNode({
  type: "function.call",
  label: "Call Function",
  group: "Functions",
  pins: [], // real pins are derived per-instance from the target FunctionDef's full signature
  deriveFunctionPins: (fn) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...fn.inputs.map((input) => ({
      id: input.id,
      label: input.name,
      type: input.type,
      direction: "input" as const,
      defaultValue: input.defaultValue,
    })),
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...fn.outputs.map((output) => ({
      id: output.id,
      label: output.name,
      type: output.type,
      direction: "output" as const,
    })),
  ],
  execute: async ({ node, inputs, ctx }) => {
    const fn = ctx.rootGraph.functions.find((f) => f.id === node.functionId);
    if (!fn) return { nextExec: "exec-out" };
    // `inputs` already contains exactly this call's input-pin values (the generic per-step
    // resolution loop only resolves INPUT-direction pins), keyed by the same ids as fn.inputs —
    // exactly the argValues shape runFunctionCall expects.
    const outputs = await runFunctionCall(fn, inputs, ctx);
    return { nextExec: "exec-out", outputs };
  },
});
