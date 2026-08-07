import { connectionsFrom, connectionTo } from "@hermione/graph/engine/graphQueries";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { indent, compileResultVar } from "@hermione/graph/engine/compileUtils";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CodeScriptDef, FunctionDef, PinSignatureEntry } from "@hermione/graph/engine/types";

export interface TriggerDescriptor {
  nodeId: string;
  kind: string;
  functionName: string;
  details: Record<string, unknown>;
}

/** A graph global variable's compiled class-field name, exposed alongside TriggerDescriptor so a
 * caller that needs to seed/read a variable from outside (tests, tooling) can find its real
 * `this.<fieldName>` without reimplementing the compiler's own name-slugging. */
export interface VariableDescriptor {
  id: string;
  name: string;
  fieldName: string;
}

export interface CompileResult {
  code: string;
  manifest: { triggers: TriggerDescriptor[]; variables: VariableDescriptor[] };
}

/** Mutable state threaded through the whole compile — shared across the root graph and every
 * function body compiled along the way, so helpers/imports dedupe file-wide and each FunctionDef
 * only ever gets compiled to its own class method once regardless of how many call sites (across
 * the root graph and other function bodies) invoke it. */
interface CompileState {
  helpers: Map<string, string>;
  imports: Set<string>;
  /** fn.id -> its generated method name, registered BEFORE compiling its body so a function that
   * calls itself resolves fine (every method is reachable via `this.<name>` regardless of order). */
  functionNames: Map<string, string>;
  usedFunctionNames: Set<string>;
  /** fn.id -> its full compiled method source (unindented) — collected separately from `helpers`
   * since these are emitted INSIDE the generated class, not as top-level file helpers. */
  functionMethods: Map<string, string>;
  /** Variable.id -> its compiled class-field name — every global variable, computed once up front
   * so any reference anywhere in the class (a trigger method or a custom function's own method)
   * resolves to the exact same `this.<name>`. */
  globalVariableNames: Map<string, string>;
  /** A function body Graph -> its own LOCAL variables' compiled names, populated once when that
   * function starts compiling. Keyed by object identity (not fn.id) so the root graph, which is
   * never a value here, unambiguously falls through to globalVariableNames instead. Local names
   * never need to dedupe against global ones — a local is always a bare `let`, a global is always
   * `this.<name>`, two different namespaces that can't collide even if the text matches. */
  localVariableNamesByGraph: Map<Graph, Map<string, string>>;
  /** A function body Graph -> its own declared inputs' compiled parameter names — function.entry's
   * data outputs resolve straight to these (see compileResolveDataPin) instead of a string-keyed
   * `args` object. Populated once when that function starts compiling, same as the map above. */
  functionArgNamesByGraph: Map<Graph, Map<string, string>>;
  /** A function body Graph -> its own declared outputs' compiled `let` binding names — a real
   * variable per output that function.return's compileExecute (see function.ts) assigns straight
   * into, instead of a string-keyed `result` object. The compiled method still returns a plain
   * object built from these bindings so function.call's own call site can read named outputs off
   * it, same as before. */
  functionOutputNamesByGraph: Map<Graph, Map<string, string>>;
  /** A function.call node's id -> its own compiled destructured binding names, one per output pin —
   * populated when that call site is compiled (see compileFrom's function.call branch) so a later
   * compileResolveDataPin lookup for the same call resolves straight to the bound name instead of
   * indexing into a result object. Keyed by node.id (not fn.id) since the same function can be
   * called from multiple sites, each needing its own distinctly-named bindings. */
  functionCallOutputNamesByNode: Map<string, Map<string, string>>;
  /** script.id -> its generated top-level helper function name, memoized so a script bound to more
   * than one Code node still only ever gets compiled (and only ever declares its own `run`) once. */
  scriptHelperNames: Map<string, string>;
  usedScriptHelperNames: Set<string>;
  /** script.id -> its declared outputs' compiled `let` binding names inside its own helper function
   * (see compileScriptDef) — the call site (compileFrom's code.run branch) destructures the call's
   * return value using these same names, exactly like functionOutputNamesByGraph for function.call. */
  scriptOutputNamesById: Map<string, Map<string, string>>;
  /** A code.run node's id -> its own compiled destructured binding names, one per output pin — same
   * role as functionCallOutputNamesByNode, but for Code nodes' script outputs. */
  codeCallOutputNamesByNode: Map<string, Map<string, string>>;
  /** An event-trigger node's own id (e.g. event.request) -> its own declared outputEntries'
   * compiled real trigger-method parameter names — sibling of functionArgNamesByGraph, but keyed
   * per NODE instead of per Graph, since (unlike a FunctionDef's own body) every event-trigger node
   * shares the same single root Graph: only the one trigger method actually compiled FOR that node
   * (see currentTriggerNodeId below) ever receives these as real parameters. */
  eventTriggerArgNamesByNode: Map<string, Map<string, string>>;
  /** The event-trigger node whose own trigger method is being compiled right now (or null between
   * triggers) — lets compileResolveDataPin reject a reference to one event node's declared outputs
   * from a DIFFERENT event's compiled body, the same mistake functionArgNamesByGraph's Graph-keying
   * already prevents for free between function bodies. */
  currentTriggerNodeId: string | null;
}

/** Resolves a variable id to the exact JS reference compiled code should use for it — a bare local
 * name if `graph` (whichever body is currently being compiled) declares it as its own, else the
 * global class field. Shared by every compileEvaluate/compileExecute call the compiler makes so no
 * NodeDef needs to know the local-vs-global distinction itself (see variable.ts). */
function makeResolveVariableRef(graph: Graph, state: CompileState): (variableId: string) => string {
  return (variableId: string) => {
    const localName = state.localVariableNamesByGraph.get(graph)?.get(variableId);
    if (localName) return localName;
    const globalName = state.globalVariableNames.get(variableId);
    if (globalName) return `this.${globalName}`;
    throw new Error(`Variable "${variableId}" isn't declared in any scope visible here — cannot compile this reference`);
  };
}

/** Resolves a FunctionDef output's pin id to the `let` binding compiled for it — only ever called
 * while compiling that same function's own body (see function.ts's function.return). */
function makeResolveFunctionOutputRef(graph: Graph, state: CompileState): (outputPinId: string) => string {
  return (outputPinId: string) => {
    const name = state.functionOutputNamesByGraph.get(graph)?.get(outputPinId);
    if (!name) throw new Error(`Output "${outputPinId}" isn't declared on the function body being compiled here — cannot compile this reference`);
    return name;
  };
}

function findNode(graph: Graph, nodeId: string): NodeInstance {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found in graph`);
  return node;
}

function collectHelpers(defHelpers: Record<string, string> | undefined, helpers: Map<string, string>): void {
  if (!defHelpers) return;
  for (const [name, source] of Object.entries(defHelpers)) {
    helpers.set(name, source);
  }
}

function collectImports(defImports: string[] | undefined, imports: Set<string>): void {
  if (!defImports) return;
  for (const line of defImports) {
    imports.add(line);
  }
}

/** Shared by functionNameFor (event trigger names) and compileFunctionDef (user function names) —
 * turns arbitrary user-authored text into a valid, readable JS identifier fragment. */
function slugify(raw: string, fallback: string): string {
  const slug = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  return slug || fallback;
}

function uniqueName(candidate: string, usedNames: Set<string>): string {
  let name = candidate;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${candidate}${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

/** Compile-time counterpart of resolveDataPin: returns a JS expression string instead of a value.
 * `rootGraph` stays fixed at the true top-level graph even while `graph` is swapped to a function's
 * body — variables/functions/scripts are always looked up off rootGraph, never a body's own (unused)
 * fields, mirroring executor.ts's ctx.rootGraph/ctx.graph split. */
function compileResolveDataPin(rootGraph: Graph, graph: Graph, nodeId: string, pinId: string, state: CompileState): string {
  const node = findNode(graph, nodeId);
  const pin = node.pins[pinId];
  const conn = connectionTo(graph, nodeId, pinId);

  if (!conn) {
    return JSON.stringify(pin?.value ?? null);
  }

  const upstreamNode = findNode(graph, conn.fromNode);

  // A function.entry's data outputs are just this compiled function's own real parameters, keyed
  // the same way as fn.inputs ids — no generic compileEvaluate needed, the expression never depends
  // on anything but the requested pin id itself.
  if (upstreamNode.type === "function.entry") {
    const argName = state.functionArgNamesByGraph.get(graph)?.get(conn.fromPin);
    if (!argName) throw new Error(`Input "${conn.fromPin}" isn't declared on the function body being compiled here — cannot compile this reference`);
    return argName;
  }

  // A function.call's data outputs are just the real bindings its own compiled statement (see
  // compileFrom's function.call branch) already destructured the call's return value into.
  if (upstreamNode.type === "function.call") {
    const name = state.functionCallOutputNamesByNode.get(upstreamNode.id)?.get(conn.fromPin);
    if (!name) throw new Error(`Output "${conn.fromPin}" isn't declared on function call node "${upstreamNode.id}" — cannot compile this reference`);
    return name;
  }

  // A code.run's data outputs are, the same way, just the real bindings its own compiled statement
  // (see compileFrom's code.run branch) already destructured its script's return value into.
  if (upstreamNode.type === "code.run") {
    const name = state.codeCallOutputNamesByNode.get(upstreamNode.id)?.get(conn.fromPin);
    if (!name) throw new Error(`Output "${conn.fromPin}" isn't declared on code node "${upstreamNode.id}" — cannot compile this reference`);
    return name;
  }

  const upstreamDef = getNodeDef(upstreamNode.type);

  // An event-trigger node's own declared outputEntries (e.g. event.request's user-chosen request
  // fields) are just its own trigger method's real parameters — same reasoning as function.entry
  // above, but keyed per NODE (eventTriggerArgNamesByNode) since every event-trigger node shares one
  // root Graph. Only resolvable while THAT node's own trigger method is the one being compiled
  // (currentTriggerNodeId) — referencing it from a different event's body would compile to a
  // parameter that method never declared.
  if (upstreamDef.eventTrigger && (upstreamNode.outputEntries?.length ?? 0) > 0) {
    if (state.currentTriggerNodeId !== upstreamNode.id) {
      throw new Error(`Output "${conn.fromPin}" on event node "${upstreamNode.id}" is only available within its own trigger method — it can't be read from a different event's chain`);
    }
    const argName = state.eventTriggerArgNamesByNode.get(upstreamNode.id)?.get(conn.fromPin);
    if (!argName) throw new Error(`Output "${conn.fromPin}" isn't declared on event node "${upstreamNode.id}" — cannot compile this reference`);
    return argName;
  }

  // A latent/exec node's data outputs (e.g. an HTTP-calling node's success/error/status) come from
  // compileExecuteOutputs instead of compileEvaluate — see that field's own doc comment for why the
  // two aren't interchangeable. Checked before requiring compileEvaluate, not merely as a fallback,
  // since a node exposing this only ever exposes THIS, never both.
  if (upstreamDef.compileExecuteOutputs) {
    collectHelpers(upstreamDef.compileHelpers, state.helpers);
    collectImports(upstreamDef.compileImports, state.imports);
    const outputs = upstreamDef.compileExecuteOutputs({ node: upstreamNode, graph });
    const expr = outputs[conn.fromPin];
    if (expr === undefined) {
      throw new Error(`Node type "${upstreamNode.type}" compileExecuteOutputs did not return an expression for output pin "${conn.fromPin}"`);
    }
    return expr;
  }

  if (!upstreamDef.compileEvaluate) {
    throw new Error(`Node type "${upstreamNode.type}" has no compileEvaluate — cannot compile this graph yet`);
  }

  const upstreamPinDefs = upstreamNode.resolvePinDefs(rootGraph.getVisibleVariables(graph), rootGraph.functions, rootGraph.scripts);
  const upstreamInputs: Record<string, string> = {};
  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      upstreamInputs[pinDef.id] = compileResolveDataPin(rootGraph, graph, upstreamNode.id, pinDef.id, state);
    }
  }

  collectHelpers(upstreamDef.compileHelpers, state.helpers);
  collectImports(upstreamDef.compileImports, state.imports);
  const outputs = upstreamDef.compileEvaluate({
    node: upstreamNode,
    inputs: upstreamInputs,
    graph,
    resolveVariableRef: makeResolveVariableRef(graph, state),
  });
  const expr = outputs[conn.fromPin];
  if (expr === undefined) {
    throw new Error(`Node type "${upstreamNode.type}" compileEvaluate did not return an expression for output pin "${conn.fromPin}"`);
  }
  return expr;
}

/** Compile-time counterpart of runExecFrom's step walk: compiles whatever is wired to (nodeId, execInPin) into statements. */
function compileFrom(rootGraph: Graph, graph: Graph, nodeId: string, execInPin: string, visiting: Set<string>, state: CompileState): string[] {
  const key = `${nodeId}:${execInPin}`;
  if (visiting.has(key)) {
    throw new Error(`Cyclic exec flow detected at ${key} — loop nodes aren't supported yet`);
  }
  visiting.add(key);

  const node = findNode(graph, nodeId);
  // Disabled (see NodeInstance.disabled): its own compileExecute never runs — instead, splice in
  // the compiled statements for the disabled exec-out pin(s), back to back. Mirrors runExecFrom's
  // disabled handling exactly (see its own comment, and NodeDef.disabledNextExec's), so Run and
  // Compile never disagree: every exec-out pin by default (there's no result to tell us which one
  // its logic would have picked, e.g. a disabled Branch), unless the NodeDef overrides this (a
  // disabled loop node must splice in only "completed", never running "loop-body"). For the common
  // single exec-in/exec-out node this default is just "splice in whatever comes next, unconditionally."
  if (node.disabled) {
    const execOutPins =
      getNodeDef(node.type).disabledNextExec ??
      node
        .resolvePinDefs(rootGraph.getVisibleVariables(graph), rootGraph.functions, rootGraph.scripts)
        .filter((p) => p.direction === "output" && p.type === "exec")
        .map((p) => p.id);

    const statements: string[] = [];
    for (const pinId of execOutPins) {
      for (const conn of connectionsFrom(graph, node.id, pinId)) {
        statements.push(...compileFrom(rootGraph, graph, conn.toNode, conn.toPin, visiting, state));
      }
    }
    visiting.delete(key);
    return statements;
  }

  // function.call needs to compile a DIFFERENT graph (the target FunctionDef's own body) into its
  // own class method and then just invoke it — outside the shape any single NodeDef's
  // compileExecute (node/inputs/graph/compileFrom, all scoped to the CURRENT graph) can express, so
  // it's handled directly here instead, the same way disabled-node handling is above.
  if (node.type === "function.call") {
    const fn = rootGraph.functions.find((f) => f.id === node.functionId);
    if (!fn) {
      throw new Error(`Function call node "${node.id}" isn't bound to any function — cannot compile this graph yet`);
    }
    const fnName = compileFunctionDef(rootGraph, fn, state);
    // Positional, in fn.inputs' declared order — matches the real parameter list compileFunctionDef
    // generates for this same fn, so no string-keyed args object is needed at the call site either.
    const argValues = fn.inputs.map((input) => compileResolveDataPin(rootGraph, graph, node.id, input.id, state));
    const call = `await this.${fnName}(${argValues.join(", ")})`;

    let statements: string[];
    if (fn.outputs.length === 0) {
      statements = [`${call};`];
    } else {
      // Destructures the call's return value straight into real bound names (one per output pin,
      // prefixed by compileResultVar(node.id) so they can never collide with another call site's own
      // bindings, even for two calls to the same function) instead of keeping the returned object
      // around to index into later. Keyed by the function's own shorthand-returned binding name
      // (see compileFunctionDef), not the output's pin id.
      const fnOutputNames = state.functionOutputNamesByGraph.get(fn.body)!;
      const usedNamesForThisCall = new Set<string>();
      const callOutputNames = new Map<string, string>();
      for (const output of fn.outputs) {
        callOutputNames.set(output.id, uniqueName(`${compileResultVar(node.id)}_${slugify(output.name, "out")}`, usedNamesForThisCall));
      }
      state.functionCallOutputNamesByNode.set(node.id, callOutputNames);

      const destructureEntries = fn.outputs.map((output) => `${fnOutputNames.get(output.id)}: ${callOutputNames.get(output.id)}`).join(", ");
      statements = [`const { ${destructureEntries} } = ${call};`];
    }

    const outgoing = connectionsFrom(graph, node.id, "exec-out");
    if (outgoing.length > 1) {
      throw new Error(`Node "${node.id}" (function.call) exec-out pin fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
    }
    if (outgoing.length === 1) {
      const [conn] = outgoing;
      statements.push(...compileFrom(rootGraph, graph, conn.toNode, conn.toPin, visiting, state));
    }
    visiting.delete(key);
    return statements;
  }

  // code.run is a user-authored script (see nodes/code.ts), not a fixed NodeDef — it's handled
  // directly here too, same reason and same shape as function.call above, so its script's own
  // top-level statements live in one real top-level function (see compileScriptDef) instead of
  // being re-declared inline as an IIFE inside every trigger/method that happens to call it.
  if (node.type === "code.run") {
    const script = rootGraph.scripts.find((s) => s.id === node.scriptId);
    if (!script) {
      throw new Error(`Code node "${node.id}" has no script assigned — cannot compile this graph yet`);
    }
    if (!script.compiledJs) {
      throw new Error(`Code node "${node.id}"'s script "${script.name}" has never been saved — cannot compile this graph yet`);
    }

    const helperName = compileScriptDef(script, state);
    const inputsObjExpr = `{ ${script.inputs.map((input) => `${JSON.stringify(input.name)}: ${compileResolveDataPin(rootGraph, graph, node.id, input.id, state)}`).join(", ")} }`;
    const call = `await ${helperName}(this.log, ${inputsObjExpr})`;

    let statements: string[];
    if (script.outputs.length === 0) {
      statements = [`${call};`];
    } else {
      // Same call-site destructuring convention as function.call: real bound names, one per output,
      // prefixed by compileResultVar(node.id) so two Code nodes (even bound to the same script)
      // never collide, keyed by the script's own shorthand-returned binding name (see
      // compileScriptDef), not the output's pin id.
      const scriptOutputNames = state.scriptOutputNamesById.get(script.id)!;
      const usedNamesForThisCall = new Set<string>();
      const callOutputNames = new Map<string, string>();
      for (const output of script.outputs) {
        callOutputNames.set(output.id, uniqueName(`${compileResultVar(node.id)}_${slugify(output.name, "out")}`, usedNamesForThisCall));
      }
      state.codeCallOutputNamesByNode.set(node.id, callOutputNames);

      const destructureEntries = script.outputs.map((output) => `${scriptOutputNames.get(output.id)}: ${callOutputNames.get(output.id)}`).join(", ");
      statements = [`const { ${destructureEntries} } = ${call};`];
    }

    const outgoing = connectionsFrom(graph, node.id, "exec-out");
    if (outgoing.length > 1) {
      throw new Error(`Node "${node.id}" (code.run) exec-out pin fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
    }
    if (outgoing.length === 1) {
      const [conn] = outgoing;
      statements.push(...compileFrom(rootGraph, graph, conn.toNode, conn.toPin, visiting, state));
    }
    visiting.delete(key);
    return statements;
  }

  const def = getNodeDef(node.type);
  if (!def.compileExecute) {
    throw new Error(`Node type "${node.type}" has no compileExecute — cannot compile this graph yet`);
  }

  const pinDefs = node.resolvePinDefs(rootGraph.getVisibleVariables(graph), rootGraph.functions, rootGraph.scripts);
  const inputs: Record<string, string> = {};
  for (const pinDef of pinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      inputs[pinDef.id] = compileResolveDataPin(rootGraph, graph, node.id, pinDef.id, state);
    }
  }

  collectHelpers(def.compileHelpers, state.helpers);
  collectImports(def.compileImports, state.imports);

  const statements = def.compileExecute({
    node,
    inputs,
    graph,
    resolveVariableRef: makeResolveVariableRef(graph, state),
    resolveFunctionOutputRef: makeResolveFunctionOutputRef(graph, state),
    compileFrom: (execOutPin: string) => {
      // connectPins now enforces "one wire per exec output" itself, so this can't arise
      // through normal editor use — this guard only catches a hand-edited/corrupted graph.
      const outgoing = connectionsFrom(graph, node.id, execOutPin);
      if (outgoing.length > 1) {
        throw new Error(`Node "${node.id}" (${node.type}) exec-out pin "${execOutPin}" fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
      }
      if (outgoing.length === 0) return [];
      const [conn] = outgoing;
      return compileFrom(rootGraph, graph, conn.toNode, conn.toPin, visiting, state);
    },
  });

  visiting.delete(key);
  return statements;
}

/** Compiles a FunctionDef's body into its own class method, memoized by fn.id in
 * state.functionNames (registered before recursing into the body, so a function that calls itself
 * resolves fine — every method is reachable via `this.<name>` regardless of declaration order) —
 * every function.call site just invokes `this.<name>(...)` afterward instead of re-inlining its
 * body, so calling the same function more than once never risks colliding on Entry/Return's
 * compiled variable names. */
function compileFunctionDef(rootGraph: Graph, fn: FunctionDef, state: CompileState): string {
  const existing = state.functionNames.get(fn.id);
  if (existing) return existing;

  const fnName = uniqueName(`fn_${slugify(fn.name, "function")}`, state.usedFunctionNames);
  state.functionNames.set(fn.id, fnName);

  // Inputs, outputs and local body variables all share one pool of names — a real JS parameter,
  // `let` binding, or local declaration respectively, so none of the three kinds can ever collide
  // with each other even if their (slugified) names happen to match.
  const usedLocalNames = new Set<string>();

  // Each declared input becomes a real named parameter — function.entry's data outputs resolve
  // straight to these (see compileResolveDataPin) instead of a string-keyed `args` object.
  const argNames = new Map<string, string>();
  for (const input of fn.inputs) {
    argNames.set(input.id, uniqueName(slugify(input.name, "arg"), usedLocalNames));
  }
  state.functionArgNamesByGraph.set(fn.body, argNames);

  // Each declared output becomes a real `let` binding too — fixing what the old rt.state-keyed
  // design got wrong: two concurrent/recursive calls to the same function no longer share a slot.
  // function.return's compileExecute (see function.ts) assigns straight into these instead of a
  // string-keyed `result` object; the method still returns a plain object built from them at the
  // end so function.call's own call site can keep reading named outputs off it, same as before.
  const outputNames = new Map<string, string>();
  for (const output of fn.outputs) {
    outputNames.set(output.id, uniqueName(slugify(output.name, "outVar"), usedLocalNames));
  }
  state.functionOutputNamesByGraph.set(fn.body, outputNames);

  const localNames = new Map<string, string>();
  for (const variable of fn.body.variables) {
    localNames.set(variable.id, uniqueName(slugify(variable.name, "localVar"), usedLocalNames));
  }
  state.localVariableNamesByGraph.set(fn.body, localNames);

  const entryNode = fn.body.nodes.find((n) => n.type === "function.entry" && n.functionId === fn.id);
  const outgoing = entryNode ? connectionsFrom(fn.body, entryNode.id, "exec-out") : [];
  if (outgoing.length > 1) {
    throw new Error(`Function "${fn.name}" Entry node exec-out fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
  }
  const bodyStatements = outgoing.length === 0 ? [] : compileFrom(rootGraph, fn.body, outgoing[0].toNode, outgoing[0].toPin, new Set(), state);

  // Declared here with the function's declared defaults so a body that never reaches a Return
  // still returns something sensible, same as runFunctionCall's own default-then-overwrite behavior.
  const outputDeclarations = fn.outputs.map((output) => `let ${outputNames.get(output.id)} = ${JSON.stringify(output.defaultValue ?? null)}; // ${output.name}`);
  const localDeclarations = fn.body.variables.map((v) => `let ${localNames.get(v.id)} = ${JSON.stringify(v.defaultValue)}; // ${v.name}`);
  // Shorthand — each key is exactly the `let` binding declared above, so the call site can
  // destructure this same name straight back out (see compileFrom's function.call branch).
  const returnEntries = fn.outputs.map((output) => `    ${outputNames.get(output.id)}, // ${output.name}`).join("\n");
  const paramList = fn.inputs.map((input) => argNames.get(input.id)).join(", ");

  const source = [`async ${fnName}(${paramList}) {`, ...indent(outputDeclarations), ...indent(localDeclarations), ...indent(bodyStatements), `  return {`, returnEntries, `  };`, `}`].join("\n");

  state.functionMethods.set(fn.id, source);
  return fnName;
}

/** Compiles a CodeScriptDef's user-authored script into its own top-level helper function,
 * memoized by script.id in state.scriptHelperNames so a script bound to more than one Code node is
 * still only ever compiled — and its own top-level statements only ever declared — once. A plain
 * top-level function rather than a class method (unlike compileFunctionDef): a script's whole
 * signature is just (log, inputs), it never needs `this` for anything. */
function compileScriptDef(script: CodeScriptDef, state: CompileState): string {
  const existing = state.scriptHelperNames.get(script.id);
  if (existing) return existing;

  const helperName = uniqueName(`script_${slugify(script.name, "script")}`, state.usedScriptHelperNames);
  state.scriptHelperNames.set(script.id, helperName);

  const usedOutputNames = new Set<string>();
  const outputNames = new Map<string, string>();
  for (const output of script.outputs) {
    outputNames.set(output.id, uniqueName(slugify(output.name, "out"), usedOutputNames));
  }
  state.scriptOutputNamesById.set(script.id, outputNames);

  // Normalizes whatever run() returned (or a throw) into real `let` bindings, one per declared
  // output, falling back to that output's own default exactly like namedInputsFor/pinOutputsFor do
  // at interpret time — the call site (compileFrom's code.run branch) destructures these back out
  // the same way function.call reads a custom function's outputs.
  const outputDeclarations = script.outputs.map((output) => `let ${outputNames.get(output.id)} = (${JSON.stringify(output.name)} in __normalized) ? __normalized[${JSON.stringify(output.name)}] : ${JSON.stringify(output.defaultValue)}; // ${output.name}`);
  const returnEntries = script.outputs.map((output) => `    ${outputNames.get(output.id)}, // ${output.name}`).join("\n");

  const source = [
    `async function ${helperName}(log, inputs) {`,
    ...script.compiledJs.split("\n").map((line) => `  ${line}`),
    "  const __ret = await run(log, inputs);",
    '  const __normalized = (__ret && typeof __ret === "object") ? __ret : {};',
    ...indent(outputDeclarations),
    "  return {",
    returnEntries,
    "  };",
    "}",
  ].join("\n");

  state.helpers.set(helperName, source);
  return helperName;
}

function functionNameFor(node: NodeInstance, usedNames: Set<string>): string {
  const rawName = typeof node.pins.name?.value === "string" ? node.pins.name.value : node.type;
  return uniqueName(slugify(rawName, "trigger"), usedNames);
}

/** The root graph's own declared return values (see nodes/flow.ts's "flow.return", the root-level
 * sibling of function.return) — sourced from the first "flow.return" node instance found, since
 * (unlike a FunctionDef's outputs) there's no separate definition object for the whole flow's own
 * signature to live on; multiple flow.return instances simply share the same "last one to fire
 * wins" semantics function.return's own multiple-Return-nodes case already has. Empty (no bindings,
 * no `return` statement) for a graph with no flow.return node at all — every existing trigger
 * method keeps compiling exactly as before. */
function rootGraphOutputEntries(graph: Graph): PinSignatureEntry[] {
  return graph.nodes.find((n) => n.type === "flow.return")?.outputEntries ?? [];
}

export function compileGraph(graph: Graph, version = 1, revision = 1): CompileResult {
  const state: CompileState = {
    helpers: new Map<string, string>(),
    imports: new Set<string>(),
    functionNames: new Map<string, string>(),
    usedFunctionNames: new Set<string>(),
    functionMethods: new Map<string, string>(),
    globalVariableNames: new Map<string, string>(),
    localVariableNamesByGraph: new Map<Graph, Map<string, string>>(),
    functionArgNamesByGraph: new Map<Graph, Map<string, string>>(),
    functionOutputNamesByGraph: new Map<Graph, Map<string, string>>(),
    functionCallOutputNamesByNode: new Map<string, Map<string, string>>(),
    scriptHelperNames: new Map<string, string>(),
    usedScriptHelperNames: new Set<string>(),
    scriptOutputNamesById: new Map<string, Map<string, string>>(),
    codeCallOutputNamesByNode: new Map<string, Map<string, string>>(),
    eventTriggerArgNamesByNode: new Map<string, Map<string, string>>(),
    currentTriggerNodeId: null,
  };

  // Every global variable becomes a real `this.<name>` class field, named up front so any
  // reference anywhere in the class — a trigger method or a custom function's own method —
  // resolves to the exact same field regardless of compile order.
  const usedGlobalNames = new Set<string>(["log"]);
  for (const variable of graph.variables) {
    state.globalVariableNames.set(variable.id, uniqueName(slugify(variable.name, "variable"), usedGlobalNames));
  }

  // The root graph's own declared return values (flow.return, if any) become real `let` bindings
  // inside EVERY trigger method, exactly like a FunctionDef's outputs (see compileFunctionDef) —
  // registered against the root graph itself in the very same map, so flow.return's compileExecute
  // (see function.return's identical resolveFunctionOutputRef mechanism in nodes/function.ts) can
  // resolve them with zero special-casing beyond this one lookup.
  const flowOutputs = rootGraphOutputEntries(graph);
  if (flowOutputs.length > 0) {
    const usedFlowOutputNames = new Set<string>();
    const flowOutputNames = new Map<string, string>();
    for (const output of flowOutputs) {
      flowOutputNames.set(output.id, uniqueName(slugify(output.name, "outVar"), usedFlowOutputNames));
    }
    state.functionOutputNamesByGraph.set(graph, flowOutputNames);
  }

  const usedNames = new Set<string>();
  const triggers: TriggerDescriptor[] = [];
  const triggerMethods: string[] = [];

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    if (!def.eventTrigger) continue;

    // This event node's own declared outputEntries (e.g. event.request's user-chosen request
    // fields) become real parameters on ITS trigger method only — see eventTriggerArgNamesByNode's
    // own doc comment and compileResolveDataPin's matching branch above.
    const usedArgNames = new Set<string>();
    const argNames = new Map<string, string>();
    for (const entry of node.outputEntries ?? []) {
      argNames.set(entry.id, uniqueName(slugify(entry.name, "arg"), usedArgNames));
    }
    if (argNames.size > 0) state.eventTriggerArgNamesByNode.set(node.id, argNames);

    const functionName = functionNameFor(node, usedNames);
    // Same defensive-only guard as above: connectPins already enforces this.
    const outgoing = connectionsFrom(graph, node.id, "exec-out");
    state.currentTriggerNodeId = node.id;
    const body =
      outgoing.length === 0
        ? []
        : (() => {
            if (outgoing.length > 1) {
              throw new Error(`Event node "${node.id}" (${node.type}) exec-out fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
            }
            const [conn] = outgoing;
            return compileFrom(graph, graph, conn.toNode, conn.toPin, new Set(), state);
          })();
    state.currentTriggerNodeId = null;

    // Declared with each output's own default so a run that never reaches a flow.return node still
    // returns something sensible — same reasoning as compileFunctionDef's own outputDeclarations.
    const flowOutputNames = state.functionOutputNamesByGraph.get(graph);
    const outputDeclarations = flowOutputNames ? flowOutputs.map((output) => `let ${flowOutputNames.get(output.id)} = ${JSON.stringify(output.defaultValue ?? null)}; // ${output.name}`) : [];
    // Keyed explicitly by the output's own declared NAME, not shorthand — a shorthand `{ x }`
    // would key the returned object by the internal (slugified/deduped) variable name instead,
    // which callers reading it by name (flow.executeFlow's compileExecuteOutputs, the hooks route)
    // never see if it differs from the declared name (e.g. spaces, or a collision suffix).
    const returnStatement = flowOutputNames ? [`return {`, ...flowOutputs.map((output) => `  ${JSON.stringify(output.name)}: ${flowOutputNames.get(output.id)},`), `};`] : [];

    const paramList = (node.outputEntries ?? []).map((entry) => argNames.get(entry.id)).join(", ");
    triggerMethods.push([`async ${functionName}(${paramList}) {`, ...indent([...outputDeclarations, ...body, ...returnStatement]), `}`].join("\n"));

    triggers.push({
      nodeId: node.id,
      kind: def.eventTrigger.kind,
      functionName,
      details: def.eventTrigger.describeInstance?.(node) ?? {},
    });
  }

  const variables: VariableDescriptor[] = graph.variables.map((v) => ({ id: v.id, name: v.name, fieldName: state.globalVariableNames.get(v.id)! }));

  const fieldAssignments = graph.variables.map((v) => `this.${state.globalVariableNames.get(v.id)} = ${JSON.stringify(v.defaultValue)}; // ${v.name}`);
  const constructorLines = [`constructor(log) {`, ...indent(["this.log = log;", ...fieldAssignments]), `}`];

  // Every custom function and every trigger becomes one method on this single class — a global
  // variable is just a class field, a local variable is just a plain `let` inside whichever
  // method declared it, and calling a custom function from anywhere is just `this.<name>(...)`.
  // A fresh instance (see the constructor above) is exactly one "run": the caller constructs one,
  // invokes whichever trigger method fired, and discards it — nothing here is meant to outlive
  // that single run, the same way a plain script starts, runs, and exits.
  const methodBlocks = [...state.functionMethods.values(), ...triggerMethods];
  const classLines = [`export class CompiledFlow {`, ...indent(constructorLines), "", ...indent(methodBlocks.join("\n\n").split("\n")), `}`];

  const parts: string[] = [
    `// Generated by Hermione from graph "${graph.name}" (Version ${version}, Revision ${revision}) — do not edit by hand.`,
    ...(state.imports.size > 0 ? ["// This graph uses node(s) whose compiled logic depends on an npm package rather than a", "// self-contained helper — running this file requires that package to be installed alongside it.", ...[...state.imports.values()]] : []),
    "",
    ...[...state.helpers.values()],
    "",
    ...classLines,
    "",
    `export const manifest = ${JSON.stringify({ triggers }, null, 2)};`,
  ];

  return { code: parts.join("\n"), manifest: { triggers, variables } };
}
