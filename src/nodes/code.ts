import { registerNode } from "../engine/registry";
import { compileResultVar } from "../engine/compileUtils";
import { CUSTOM_PIN_PREFIX } from "../engine/graphMutations";
import type { CodeScriptDef } from "../engine/types";

// The Code node runs a user-authored script (see CodeScriptDef in types.ts, edited via Monaco in
// scriptEditor.ts) — the one node type in this engine whose actual logic is data the user writes,
// not something registered up front. Its pins are entirely derived from the bound script's own
// `inputs`/`outputs` signatures (deriveScriptPins, dispatched by resolvePinDefs off
// NodeInstance.scriptId), the same "Sibling of derivePins/deriveFunctionPins" pattern Get/Set
// Variable and Entry/Return/Call already use — see graphMutations.ts's resolvePinDefs.
//
// Outputs are the exact inverse of inputs: `run()` is called with a name-keyed `inputs` object
// (namedInputsFor) and may itself RETURN a name-keyed object, which pinOutputsFor below turns back
// into pin-id-keyed node outputs — the same name<->id translation, just in the opposite direction.
// Every name on both sides is prefixed with CUSTOM_PIN_PREFIX (see graphMutations.ts) — a pin named
// "PlayerName" is read as `inputs.CustomPlayerName` and set by returning `{ CustomPlayerName: ... }`
// for an output of the same name. A script that doesn't return anything (or returns something
// that isn't a plain object) simply gets every declared output's own default value, same as an
// upstream node that never ran. This is in ADDITION to (not instead of) reporting progress via the
// `log` it's given, which still works exactly as before for scripts that don't need to hand
// anything back.
//
// TypeScript is supported by transpiling to plain JS at Save time (see scriptEditor.ts calling
// engine/transpile.ts), not at run/compile time — CodeScriptDef.compiledJs is what this node
// actually executes/embeds, so a script with unsaved edits keeps running its last-saved version
// instead of silently doing nothing or re-transpiling on every single call.

const GROUP = "Code";

function deriveScriptPins(script: CodeScriptDef) {
  return [
    { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const },
    ...script.inputs.map((input) => ({
      id: input.id,
      label: input.name,
      type: input.type,
      direction: "input" as const,
      defaultValue: input.defaultValue,
      container: input.container,
      keyType: input.keyType,
    })),
    { id: "exec-out", label: "", type: "exec" as const, direction: "output" as const },
    ...script.outputs.map((output) => ({
      id: output.id,
      label: output.name,
      type: output.type,
      direction: "output" as const,
      container: output.container,
      keyType: output.keyType,
    })),
  ];
}

type RunFunction = (
  log: (message: string) => void,
  inputs: Record<string, unknown>,
) => unknown;

// Caches the PARSED factory (the `new Function` call itself — the expensive part), not its result —
// each execute() call still invokes the factory fresh, re-running the script's top-level statements
// from scratch and getting a brand-new `run` closure every time, exactly like calling an ordinary
// `function` re-initializes its own top-level `let`/`const`s on every call. Caching the RESULT
// instead (the returned `run` itself) would let one script's top-level state silently leak across
// separate node executions (or across loop iterations) — surprising, hidden statefulness this cache
// only ever avoids re-PARSING identical script text, not re-EVALUATING it, which matters once a Code
// node sits inside a loop (Array For Each, etc.).
const scriptFactoryCache = new Map<string, () => RunFunction>();

function getRunFunction(compiledJs: string): RunFunction {
  let factory = scriptFactoryCache.get(compiledJs);
  if (!factory) {
    factory = new Function(`${compiledJs}\nreturn run;`) as () => RunFunction;
    scriptFactoryCache.set(compiledJs, factory);
  }
  return factory();
}

/** Builds the `inputs` object a script's `run()` actually sees: keyed by each input's human-chosen
 * NAME (what the user wrote in the Scripts panel) prefixed with CUSTOM_PIN_PREFIX — e.g. an input
 * named "PlayerName" is read inside the script as `inputs.CustomPlayerName` — not its internal pin
 * id (an opaque `nextId(...)` string) — `pinInputs` here is already keyed by pin id (the shape
 * resolveDataPin/execute produce). */
function namedInputsFor(script: CodeScriptDef, pinInputs: Record<string, unknown>): Record<string, unknown> {
  const named: Record<string, unknown> = {};
  for (const input of script.inputs) {
    named[`${CUSTOM_PIN_PREFIX}${input.name}`] = pinInputs[input.id];
  }
  return named;
}

/** Inverse of namedInputsFor: turns whatever `run()` returned back into pin-id-keyed node outputs —
 * an output named "Result" is SET by the script returning `{ CustomResult: ... }`. A script that
 * returns nothing (or something that isn't a plain object — e.g. it forgot to, or only ever logs)
 * is treated exactly like an output whose (prefixed) name wasn't present: that output just gets its
 * own declared default value, same as any other node output nobody actually filled in. */
function pinOutputsFor(script: CodeScriptDef, returned: unknown): Record<string, unknown> {
  const named = returned && typeof returned === "object" ? (returned as Record<string, unknown>) : {};
  const outputs: Record<string, unknown> = {};
  for (const output of script.outputs) {
    const key = `${CUSTOM_PIN_PREFIX}${output.name}`;
    outputs[output.id] = key in named ? named[key] : output.defaultValue;
  }
  return outputs;
}

registerNode({
  type: "code.run",
  label: "Code",
  description: "Runs a user-authored TypeScript script node.",
  group: GROUP,
  pins: [], // real pins are derived per-instance from the bound CodeScriptDef's inputs/outputs
  deriveScriptPins,
  // Latent (not because running a script is inherently slow, but because it's arbitrary,
  // user-authored logic — it may itself await something) — same reasoning as HTTP Request/the
  // OAuth2 nodes: latent is a UI signal here, not a promise every script actually pauses.
  latent: true,
  execute: async ({ node, inputs, ctx }) => {
    const script = ctx.rootGraph.scripts.find((s) => s.id === node.scriptId);
    if (!script || !script.compiledJs) return { nextExec: "exec-out" };

    let returned: unknown;
    try {
      const run = getRunFunction(script.compiledJs);
      returned = await run(ctx.log, namedInputsFor(script, inputs));
    } catch (err) {
      ctx.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { nextExec: "exec-out", outputs: pinOutputsFor(script, returned) };
  },
  compileExecute: ({ node, inputs, graph, compileFrom }) => {
    const script = graph.scripts.find((s) => s.id === node.scriptId);
    if (!script) {
      throw new Error(`Code node "${node.id}" has no script assigned — cannot compile this graph yet`);
    }
    if (!script.compiledJs) {
      throw new Error(`Code node "${node.id}"'s script "${script.name}" has never been saved — cannot compile this graph yet`);
    }

    const inputsObjExpr = `{ ${script.inputs.map((input) => `${JSON.stringify(`${CUSTOM_PIN_PREFIX}${input.name}`)}: ${inputs[input.id]}`).join(", ")} }`;
    const resultVar = compileResultVar(node.id);

    return [
      // Declared up front (not `const` inside the try) so a thrown/never-returning script still
      // leaves it as a plain {} — compileExecuteOutputs below reads named properties off it
      // unconditionally, same "every output always gets SOME value" guarantee execute() gives via
      // pinOutputsFor's defaultValue fallback.
      `let ${resultVar} = {};`,
      "try {",
      "  const __run = (function () {",
      ...script.compiledJs.split("\n").map((line) => `    ${line}`),
      "    return run;",
      "  })();",
      `  const __ret = await __run(rt.log, ${inputsObjExpr});`,
      `  ${resultVar} = (__ret && typeof __ret === "object") ? __ret : {};`,
      "} catch (__err) {",
      '  rt.log("Error: " + (__err instanceof Error ? __err.message : String(__err)));',
      "}",
      ...compileFrom("exec-out"),
    ];
  },
  compileExecuteOutputs: ({ node, graph }) => {
    const script = graph.scripts.find((s) => s.id === node.scriptId);
    if (!script) return {};
    const v = compileResultVar(node.id);
    const outputs: Record<string, string> = {};
    for (const output of script.outputs) {
      const nameExpr = JSON.stringify(`${CUSTOM_PIN_PREFIX}${output.name}`);
      outputs[output.id] = `(${nameExpr} in ${v} ? ${v}[${nameExpr}] : ${JSON.stringify(output.defaultValue)})`;
    }
    return outputs;
  },
});
