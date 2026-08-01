import { connectionsFrom, connectionTo } from "../engine/graphQueries";
import { getNodeDef } from "../engine/registry";
import { indent, compileResultVar } from "../engine/compileUtils";
import { Graph } from "../engine/graph";
import { NodeInstance } from "../engine/nodeInstance";
import type { FunctionDef } from "../engine/types";

export interface TriggerDescriptor {
  nodeId: string;
  kind: string;
  functionName: string;
  details: Record<string, unknown>;
}

export interface CompileResult {
  code: string;
  manifest: { triggers: TriggerDescriptor[] };
}

/** Mutable state threaded through the whole compile — shared across the root graph and every
 * function body compiled along the way, so helpers/imports dedupe file-wide and each FunctionDef
 * only ever gets compiled to its own top-level JS function once regardless of how many call sites
 * (across the root graph and other function bodies) invoke it. */
interface CompileState {
  helpers: Map<string, string>;
  imports: Set<string>;
  /** fn.id -> its generated top-level JS function name, registered BEFORE compiling its body so a
   * function that calls itself resolves via normal JS function-declaration hoisting. */
  functionNames: Map<string, string>;
  usedFunctionNames: Set<string>;
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

  // A function.entry's data outputs are just this compiled function's own `args` object, keyed the
  // same way as fn.inputs ids — no generic compileEvaluate needed, the expression never depends on
  // anything but the requested pin id itself.
  if (upstreamNode.type === "function.entry") {
    return `args[${JSON.stringify(conn.fromPin)}]`;
  }

  // A function.call's data outputs are read off the result object its own compiled statement (see
  // compileFrom's function.call branch) already assigned to compileResultVar(upstreamNode.id) —
  // same "reference into a local variable already declared" convention as compileExecuteOutputs.
  if (upstreamNode.type === "function.call") {
    return `${compileResultVar(upstreamNode.id)}[${JSON.stringify(conn.fromPin)}]`;
  }

  const upstreamDef = getNodeDef(upstreamNode.type);

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
  // own top-level JS function and then just invoke it — outside the shape any single NodeDef's
  // compileExecute (node/inputs/graph/compileFrom, all scoped to the CURRENT graph) can express, so
  // it's handled directly here instead, the same way disabled-node handling is above.
  if (node.type === "function.call") {
    const fn = rootGraph.functions.find((f) => f.id === node.functionId);
    if (!fn) {
      throw new Error(`Function call node "${node.id}" isn't bound to any function — cannot compile this graph yet`);
    }
    const fnName = compileFunctionDef(rootGraph, fn, state);
    const argEntries = fn.inputs.map((input) => `${JSON.stringify(input.id)}: ${compileResolveDataPin(rootGraph, graph, node.id, input.id, state)}`).join(", ");
    const statements = [`const ${compileResultVar(node.id)} = await ${fnName}({ ${argEntries} });`];

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

/** Compiles a FunctionDef's body into its own top-level `async function`, memoized by fn.id in
 * state.functionNames (registered before recursing into the body, so a function that calls itself
 * resolves fine via normal JS function-declaration hoisting) — every function.call site just
 * invokes the shared function by name afterward instead of re-inlining its body, so calling the
 * same function more than once never risks colliding on Entry/Return's compiled variable names. */
function compileFunctionDef(rootGraph: Graph, fn: FunctionDef, state: CompileState): string {
  const existing = state.functionNames.get(fn.id);
  if (existing) return existing;

  const fnName = uniqueName(`fn_${slugify(fn.name, "function")}`, state.usedFunctionNames);
  state.functionNames.set(fn.id, fnName);

  const entryNode = fn.body.nodes.find((n) => n.type === "function.entry" && n.functionId === fn.id);
  const outgoing = entryNode ? connectionsFrom(fn.body, entryNode.id, "exec-out") : [];
  if (outgoing.length > 1) {
    throw new Error(`Function "${fn.name}" Entry node exec-out fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`);
  }
  const bodyStatements = outgoing.length === 0 ? [] : compileFrom(rootGraph, fn.body, outgoing[0].toNode, outgoing[0].toPin, new Set(), state);

  // Every function.return instance along the way assigns straight into `result` (see
  // function.ts's compileExecute) — declared here with the function's declared defaults so a body
  // that never reaches a Return still returns something sensible, same as runFunctionCall's own
  // default-then-overwrite behavior.
  const resultEntries = fn.outputs.map((output) => `    ${JSON.stringify(output.id)}: ${JSON.stringify(output.defaultValue ?? null)}, // ${output.name}`).join("\n");

  const source = [`async function ${fnName}(args) {`, `  const result = {`, resultEntries, `  };`, ...indent(bodyStatements), `  return result;`, `}`].join("\n");

  state.helpers.set(`fn:${fn.id}`, source);
  return fnName;
}

function functionNameFor(node: NodeInstance, usedNames: Set<string>): string {
  const rawName = typeof node.pins.name?.value === "string" ? node.pins.name.value : node.type;
  return uniqueName(slugify(rawName, "trigger"), usedNames);
}

export function compileGraph(graph: Graph, version = 1, revision = 1): CompileResult {
  const state: CompileState = {
    helpers: new Map<string, string>(),
    imports: new Set<string>(),
    functionNames: new Map<string, string>(),
    usedFunctionNames: new Set<string>(),
  };
  const usedNames = new Set<string>();
  const triggers: TriggerDescriptor[] = [];
  const functionBlocks: string[] = [];

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    if (!def.eventTrigger) continue;

    const functionName = functionNameFor(node, usedNames);
    // Same defensive-only guard as above: connectPins already enforces this.
    const outgoing = connectionsFrom(graph, node.id, "exec-out");
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

    functionBlocks.push([`export async function ${functionName}(rt) {`, ...indent(body), `}`].join("\n"));

    triggers.push({
      nodeId: node.id,
      kind: def.eventTrigger.kind,
      functionName,
      details: def.eventTrigger.describeInstance?.(node) ?? {},
    });
  }

  const stateEntries = graph.variables.map((v) => `    ${JSON.stringify(v.id)}: ${JSON.stringify(v.defaultValue)}, // ${v.name}`).join("\n");

  const parts: string[] = [
    `// Generated by Hermione from graph "${graph.name}" (Version ${version}, Revision ${revision}) — do not edit by hand.`,
    ...(state.imports.size > 0 ? ["// This graph uses node(s) whose compiled logic depends on an npm package rather than a", "// self-contained helper — running this file requires that package to be installed alongside it.", ...[...state.imports.values()]] : []),
    "",
    ...[...state.helpers.values()],
    "",
    // Callers build rt = { state: eventInitialize(), log } themselves and pass the SAME
    // rt into every exported trigger function they invoke, so variable state persists across
    // firings — mirroring how the in-editor Run button shares one ExecutionContext across roots.
    `export function eventInitialize() {`,
    `  return {`,
    stateEntries,
    `  };`,
    `}`,
    "",
    ...functionBlocks,
    "",
    `export const manifest = ${JSON.stringify({ triggers }, null, 2)};`,
  ];

  return { code: parts.join("\n"), manifest: { triggers } };
}
