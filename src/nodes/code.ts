import { registerNode } from "../engine/registry";
import type { CodeScriptDef } from "../engine/types";

// The Code node runs a user-authored script (see CodeScriptDef in types.ts, edited via Monaco in
// scriptEditor.ts) — the one node type in this engine whose actual logic is data the user writes,
// not something registered up front. Its pins are entirely derived from the bound script's own
// `inputs` signature (deriveScriptPins, dispatched by resolvePinDefs off NodeInstance.scriptId),
// the same "Sibling of derivePins/deriveFunctionPins" pattern Get/Set Variable and Entry/Return/
// Call already use — see graphMutations.ts's resolvePinDefs.
//
// Deliberately no output pins: a script reports results by calling the `log` it's given (its first
// argument), not through a return value wired to a downstream pin — simpler signature, and matches
// exactly what was asked for. `run`'s return value (if any) is currently ignored.
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
  ];
}

type RunFunction = (log: (message: string) => void, inputs: Record<string, unknown>) => unknown;

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
 * NAME (what the user wrote in the Scripts panel), not its internal pin id (an opaque `nextId(...)`
 * string) — `pinInputs` here is already keyed by pin id (the shape resolveDataPin/execute produce). */
function namedInputsFor(script: CodeScriptDef, pinInputs: Record<string, unknown>): Record<string, unknown> {
  const named: Record<string, unknown> = {};
  for (const input of script.inputs) {
    named[input.name] = pinInputs[input.id];
  }
  return named;
}

registerNode({
  type: "code.run",
  label: "Code",
  description: "Runs a user-authored TypeScript script node.",
  group: GROUP,
  pins: [], // real pins are derived per-instance from the bound CodeScriptDef's inputs
  deriveScriptPins,
  // Latent (not because running a script is inherently slow, but because it's arbitrary,
  // user-authored logic — it may itself await something) — same reasoning as HTTP Request/the
  // OAuth2 nodes: latent is a UI signal here, not a promise every script actually pauses.
  latent: true,
  execute: async ({ node, inputs, ctx }) => {
    const script = ctx.rootGraph.scripts.find((s) => s.id === node.scriptId);
    if (!script || !script.compiledJs) return { nextExec: "exec-out" };

    try {
      const run = getRunFunction(script.compiledJs);
      await run(ctx.log, namedInputsFor(script, inputs));
    } catch (err) {
      ctx.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ node, inputs, graph, compileFrom }) => {
    const script = graph.scripts.find((s) => s.id === node.scriptId);
    if (!script) {
      throw new Error(`Code node "${node.id}" has no script assigned — cannot compile this graph yet`);
    }
    if (!script.compiledJs) {
      throw new Error(`Code node "${node.id}"'s script "${script.name}" has never been saved — cannot compile this graph yet`);
    }

    const inputsObjExpr = `{ ${script.inputs.map((input) => `${JSON.stringify(input.name)}: ${inputs[input.id]}`).join(", ")} }`;

    return [
      "try {",
      "  const __run = (function () {",
      ...script.compiledJs.split("\n").map((line) => `    ${line}`),
      "    return run;",
      "  })();",
      `  await __run(rt.log, ${inputsObjExpr});`,
      "} catch (__err) {",
      '  rt.log("Error: " + (__err instanceof Error ? __err.message : String(__err)));',
      "}",
      ...compileFrom("exec-out"),
    ];
  },
});
