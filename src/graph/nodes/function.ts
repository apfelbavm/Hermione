import { runFunctionCall } from "../engine/executor";
import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

// function.entry's data outputs and function.call's whole compiled call (a target FunctionDef's
// body is a different Graph, outside what any single node's compileExecute/compileEvaluate can
// express) are special-cased directly in compiler/codegen.ts instead of via NodeDef fields here.
// function.return is a normal terminal exec node, so it gets an ordinary compileExecute below.

registerNode({
  type: "function.entry",
  label: i18n.nodes.function.entry.label,
  description: i18n.nodes.function.entry.description,
  group: "Functions",
  colorCategory: NodeColorCategory.Integration,
  pins: [], // real pins are derived per-instance from the owning FunctionDef's inputs
  deriveFunctionPins: (fn) => [
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...fn.inputs.map((input) => ({
      id: input.id,
      label: input.name,
      type: input.type,
      direction: "output" as const,
      container: input.container,
      keyType: input.keyType,
      subType: input.subType,
    })),
  ],
  execute: () => ({ nextExec: "exec-out" }),
  // Each declared input surfaces here as an output pin, sourced from the current call's resolved
  // arguments — ctx.entryArgs is already keyed by the same PinSignatureEntry ids as these pins.
  evaluate: ({ ctx }) => ({ ...ctx.entryArgs }),
});

registerNode({
  type: "function.return",
  label: i18n.nodes.function.return.label,
  description: i18n.nodes.function.return.description,
  group: "Functions",
  colorCategory: NodeColorCategory.Integration,
  pins: [], // real pins are derived per-instance from the owning FunctionDef's outputs
  deriveFunctionPins: (fn) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...fn.outputs.map((output) => ({
      id: output.id,
      label: output.name,
      type: output.type,
      direction: "input" as const,
      defaultValue: output.defaultValue,
      container: output.container,
      keyType: output.keyType,
      subType: output.subType,
    })),
  ],
  // Terminal — no exec-out. Reports its resolved input values as this call's outputs; if the body
  // forks and reaches more than one Return instance, the last one to fire wins (same "most recent
  // write wins" rule already used for variables/tickCache).
  execute: ({ inputs, ctx }) => {
    ctx.onReturn?.(inputs);
    return {};
  },
  // Assigns straight into the compiled function's `result` object (declared by
  // compiler/codegen.ts's compileFunctionDef) — no exec-out to compileFrom into, since Return is
  // terminal, mirroring execute()'s own "last one to fire wins" semantics for free (whichever
  // Return statement runs last in the compiled body simply overwrites the same keys).
  compileExecute: ({ inputs }) => Object.entries(inputs).map(([pinId, expr]) => `result[${JSON.stringify(pinId)}] = ${expr};`),
});

registerNode({
  type: "function.call",
  label: i18n.nodes.function.call.label,
  description: i18n.nodes.function.call.description,
  group: "Functions",
  colorCategory: NodeColorCategory.Integration,
  pins: [], // real pins are derived per-instance from the target FunctionDef's full signature
  deriveFunctionPins: (fn) => [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    ...fn.inputs.map((input) => ({
      id: input.id,
      label: input.name,
      type: input.type,
      direction: "input" as const,
      defaultValue: input.defaultValue,
      container: input.container,
      keyType: input.keyType,
      subType: input.subType,
    })),
    { id: "exec-out", label: "", type: "exec", direction: "output" },
    ...fn.outputs.map((output) => ({
      id: output.id,
      label: output.name,
      type: output.type,
      direction: "output" as const,
      container: output.container,
      keyType: output.keyType,
      subType: output.subType,
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
