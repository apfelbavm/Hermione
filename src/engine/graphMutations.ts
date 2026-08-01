import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef, isPinTypeCompatible } from "./registry";
import { defaultStructValue, tryGetStructTypeDef } from "./structRegistry";
import type { CodeScriptDef, CommentBox, Connection, FunctionDef, PinContainer, PinSignatureEntry, PinType, Variable } from "./types";

/** Defensive shallow clone for a value about to be copied from a PinDef/Variable's `defaultValue`
 * into a live Pin.value slot. A container's default is a plain array (see PinContainer's own doc
 * comment), and that ONE array object is shared by reference across every instance/read of the
 * owning NodeDef/Variable (a NodeDef's `pins` is built once at registerNode-time; a Variable has
 * exactly one `defaultValue`) — copying it in by reference would let one instance's later edit
 * silently corrupt every other instance, or the template/variable itself. Scalars (number/string/
 * boolean/null) are immutable already, so this is a no-op for them. */
export function cloneDefaultValue(value: unknown): unknown {
  return Array.isArray(value) ? value.slice() : value;
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_VALUE_BY_TYPE: Record<PinType, unknown> = {
  exec: undefined,
  number: 0,
  boolean: false,
  string: "",
  object: null,
  date: "",
  enum: "",
  struct: {},
};

/** Removes one entry pin from a node with an expandable, user-editable pin list (see
 * NodeDef.deriveInstancePins) — deletes its Pin record and prunes any connection touching it.
 * Generic across every such node type; which of its derived pins are eligible for this is up to
 * that node type's own deriveInstancePins (see PinDef.removable), not this function. Afterward,
 * gives the node type a chance (NodeDef.onInstancePinRemoved) to also remove a linked sibling pin —
 * e.g. Make Map's key-N when its paired value-N is the one actually deleted — since this function
 * only ever targets one pin id per call. Guards against a hook that (incorrectly) names a pin
 * that's already gone, so it can never loop. */
export function removeInstancePin(graph: Graph, nodeId: string, pinId: string, visited: Set<string> = new Set()): void {
  if (visited.has(pinId)) return;
  visited.add(pinId);

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || !(pinId in node.pins)) return;
  delete node.pins[pinId];
  graph.connections = graph.connections.filter((c) => !((c.fromNode === nodeId && c.fromPin === pinId) || (c.toNode === nodeId && c.toPin === pinId)));

  const extraPinIds = getNodeDef(node.type).onInstancePinRemoved?.(node, pinId) ?? [];
  for (const extraPinId of extraPinIds) {
    removeInstancePin(graph, nodeId, extraPinId, visited);
  }
}

export interface ConnectRequest {
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}

/** Validates and creates a connection, enforcing the pin value/connection XOR invariant.
 * `variables`/`functions` must be the full VISIBLE sets (see getVisibleVariables) — not just
 * `graph.variables`/`graph.functions`, since `graph` may be a function's body, whose own
 * `.variables` is local-only and whose `.functions` is always empty. */
export function connectPins(graph: Graph, variables: Variable[], functions: FunctionDef[], req: ConnectRequest, scripts: CodeScriptDef[] = []): Connection {
  const fromNode = graph.nodes.find((n) => n.id === req.fromNode);
  const toNode = graph.nodes.find((n) => n.id === req.toNode);
  if (!fromNode || !toNode) throw new Error("connectPins: node not found");

  const fromPinDef = fromNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === req.fromPin);
  const toPinDef = toNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === req.toPin);
  if (!fromPinDef || !toPinDef) throw new Error("connectPins: pin not found");
  if (fromPinDef.direction !== "output" || toPinDef.direction !== "input") {
    throw new Error("connectPins: must connect an output pin to an input pin");
  }
  if (!isPinTypeCompatible(fromPinDef, toPinDef)) {
    throw new Error(`connectPins: incompatible pin types "${fromPinDef.type}" -> "${toPinDef.type}"`);
  }

  if (toPinDef.type === "exec") {
    // Exec pins invert the data-pin rule: an input may converge many incoming wires (several
    // branches can all lead to the same next step), but a single output can only ever drive
    // ONE next step — replace any existing wire leaving this output instead.
    disconnectOutput(graph, variables, functions, req.fromNode, req.fromPin, scripts);
  } else {
    // Data pins: an input takes exactly one source; an output may fan out to many freely.
    disconnectPin(graph, variables, functions, req.toNode, req.toPin, scripts);
  }

  const connection: Connection = { id: nextId("conn"), ...req };
  graph.connections.push(connection);

  const toPin = toNode.pins[req.toPin] ?? (toNode.pins[req.toPin] = {});
  toPin.connectionId = connection.id;
  toPin.value = undefined;

  return connection;
}

/** Removes the (first) connection feeding the given input pin, if any, restoring its literal default. */
export function disconnectPin(graph: Graph, variables: Variable[], functions: FunctionDef[], nodeId: string, pinId: string, scripts: CodeScriptDef[] = []): void {
  const existing = graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
  if (!existing) return;
  graph.removeConnection(variables, functions, existing.id, scripts);
}

/** Removes the connection leaving the given output pin, if any — enforces "one wire per exec output." */
export function disconnectOutput(graph: Graph, variables: Variable[], functions: FunctionDef[], nodeId: string, pinId: string, scripts: CodeScriptDef[] = []): void {
  const existing = graph.connections.find((c) => c.fromNode === nodeId && c.fromPin === pinId);
  if (!existing) return;
  graph.removeConnection(variables, functions, existing.id, scripts);
}

/** Splices a "Reroute" node (see reroute.ts) into an existing connection — Unreal's "Add Reroute
 * Node," used purely to bend a wire's path on the canvas; it changes nothing about what the graph
 * actually does. The new node's pin type is frozen to match the connection's own source pin
 * exactly (see NodeInstance.elementType/container/mapKeyType) — this engine has no wildcard/
 * inferred-from-wiring pin type (resolvePinDefs has no visibility into graph.connections by
 * design), so this is the one place a concrete type is available to seed it with; that's also
 * exactly why reroute nodes are never offered from the generic node-creation menus (see main.ts) —
 * only this call site has a wire to read a type off of. */
export function insertRerouteOnConnection(graph: Graph, variables: Variable[], functions: FunctionDef[], connectionId: string, position: { x: number; y: number }, scripts: CodeScriptDef[] = []): void {
  const conn = graph.connections.find((c) => c.id === connectionId);
  if (!conn) return;
  const fromNode = graph.nodes.find((n) => n.id === conn.fromNode);
  if (!fromNode) return;
  const fromPinDef = fromNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === conn.fromPin);
  if (!fromPinDef) return;

  const isExec = fromPinDef.type === "exec";
  const rerouteType = isExec ? "core.rerouteExec" : "core.reroute";
  const reroute = NodeInstance.createNodeInstance(rerouteType, position, getNodeDef(rerouteType).pins);
  if (!isExec) {
    reroute.elementType = fromPinDef.type;
    reroute.container = fromPinDef.container;
    reroute.mapKeyType = fromPinDef.keyType;
  }
  graph.nodes.push(reroute);

  const inPinId = isExec ? "exec-in" : "in";
  const outPinId = isExec ? "exec-out" : "out";
  const { fromNode: origFromNode, fromPin: origFromPin, toNode: origToNode, toPin: origToPin } = conn;

  // Removed first (rather than relying on connectPins' own auto-disconnect) because an exec input
  // may legally converge several incoming wires — connectPins would happily add the reroute's exec
  // path ALONGSIDE the original one instead of replacing it (see connectPins' own comment on why
  // it only auto-prunes the FROM side for exec, the TO side for data).
  graph.removeConnection(variables, functions, connectionId, scripts);
  connectPins(
    graph,
    variables,
    functions,
    {
      fromNode: origFromNode,
      fromPin: origFromPin,
      toNode: reroute.id,
      toPin: inPinId,
    },
    scripts,
  );
  connectPins(
    graph,
    variables,
    functions,
    {
      fromNode: reroute.id,
      fromPin: outPinId,
      toNode: origToNode,
      toPin: origToPin,
    },
    scripts,
  );
}

export function addVariable(graph: Graph, variable: Variable): void {
  graph.variables.push(variable);
}

/** Reorders any plain `{id}`-bearing array by moving `id` to sit immediately before/after
 * `targetId` — the shared engine behind every sidebar list's manual drag-to-reorder (Variables,
 * Functions, and a function's Inputs/Outputs — see variablePanel.ts/functionsPanel.ts/
 * functionIoPanel.ts). Every one of those arrays is plain and already round-trips through
 * save/load and clipboard as-is (no separate "order" field anywhere), so splicing it in place IS
 * the persisted order — nothing else needs updating. */
function moveInArray<T extends { id: string }>(arr: T[], id: string, targetId: string, position: "before" | "after"): void {
  if (id === targetId) return;
  const fromIndex = arr.findIndex((item) => item.id === id);
  if (fromIndex === -1) return;
  const [item] = arr.splice(fromIndex, 1);

  const targetIndex = arr.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) {
    // Target vanished somehow (defensive only) — put it back where it was rather than losing it.
    arr.splice(fromIndex, 0, item);
    return;
  }
  arr.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, item);
}

export function moveVariable(graph: Graph, variableId: string, targetVariableId: string, position: "before" | "after"): void {
  moveInArray(graph.variables, variableId, targetVariableId, position);
}

export function moveFunction(graph: Graph, functionId: string, targetFunctionId: string, position: "before" | "after"): void {
  moveInArray(graph.functions, functionId, targetFunctionId, position);
}

/** Reorders a function's Inputs or Outputs signature list (whichever `kind` names). */
export function moveFunctionEntry(fn: FunctionDef, kind: "input" | "output", entryId: string, targetEntryId: string, position: "before" | "after"): void {
  moveInArray(kind === "input" ? fn.inputs : fn.outputs, entryId, targetEntryId, position);
}

/** Removes a variable along with any Get/Set nodes bound to it — an orphaned binding has no valid
 * pins. `variables`/`functions` must be the full VISIBLE sets for `graph` (see getVisibleVariables)
 * so removeNode can correctly restore a literal default on whatever was downstream of a removed
 * Get node's output. */
export function removeVariable(graph: Graph, variables: Variable[], functions: FunctionDef[], variableId: string, scripts: CodeScriptDef[] = []): void {
  const dependentNodeIds = graph.nodes.filter((n) => n.variableId === variableId).map((n) => n.id);
  for (const nodeId of dependentNodeIds) {
    graph.removeNode(variables, functions, nodeId, scripts);
  }
  graph.variables = graph.variables.filter((v) => v.id !== variableId);
}

export function addCommentBox(graph: Graph, box: CommentBox): void {
  graph.commentBoxes.push(box);
}

export function removeCommentBox(graph: Graph, commentId: string): void {
  graph.commentBoxes = graph.commentBoxes.filter((b) => b.id !== commentId);
}

export function setPinLiteralValue(graph: Graph, nodeId: string, pinId: string, value: unknown): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`setPinLiteralValue: node "${nodeId}" not found`);
  const pin = node.pins[pinId] ?? (node.pins[pinId] = {});
  if (pin.connectionId) {
    throw new Error(`setPinLiteralValue: pin "${nodeId}:${pinId}" is connected, disconnect first`);
  }
  pin.value = value;
}

// --- Functions -------------------------------------------------------------------------------

export function allGraphs(rootGraph: Graph): Graph[] {
  return [rootGraph, ...rootGraph.functions.map((f) => f.body)];
}

/** Creates a new function with an empty signature and a body containing one auto-placed
 * function.entry node and one auto-placed function.return node — every function graph always has
 * at least one output node (both are structural and can never be deleted, see removeNode).
 * Requires the node registry to already have "function.entry"/"function.return" registered (i.e.
 * registerBuiltins() must have run), same precondition every other node-instance factory has. */
export function createFunctionDef(name: string): FunctionDef {
  const id = nextId("fn");
  const body = new Graph(nextId("fnbody"), name);
  const fn: FunctionDef = { id, name, inputs: [], outputs: [], body };

  const entryDef = getNodeDef("function.entry");
  const entryPins = entryDef.deriveFunctionPins ? entryDef.deriveFunctionPins(fn) : entryDef.pins;
  const entryNode = NodeInstance.createNodeInstance("function.entry", { x: 40, y: 120 }, entryPins, nextId("node"), undefined, fn.id);
  body.nodes.push(entryNode);

  const returnDef = getNodeDef("function.return");
  const returnPins = returnDef.deriveFunctionPins ? returnDef.deriveFunctionPins(fn) : returnDef.pins;
  const returnNode = NodeInstance.createNodeInstance("function.return", { x: 360, y: 120 }, returnPins, nextId("node"), undefined, fn.id);
  body.nodes.push(returnNode);

  return fn;
}

/** Removes a function and any Call nodes bound to it, across the root graph and every other
 * function's body (Call nodes can appear anywhere, including inside other functions). */
export function removeFunctionDef(rootGraph: Graph, functionId: string): void {
  for (const g of allGraphs(rootGraph)) {
    const variables = rootGraph.getVisibleVariables(g);
    const dependentNodeIds = g.nodes.filter((n) => n.functionId === functionId && n.type === "function.call").map((n) => n.id);
    for (const nodeId of dependentNodeIds) {
      g.removeNode(variables, rootGraph.functions, nodeId);
    }
  }
  rootGraph.functions = rootGraph.functions.filter((f) => f.id !== functionId);
}

/** Removes any now-dangling pins/connections referencing a since-removed input/output entry,
 * across every graph that could hold a node bound to this function (its own Entry/Return nodes,
 * and any Call node anywhere). */
function pruneDanglingFunctionPinReferences(rootGraph: Graph, functionId: string, pinEntryId: string): void {
  for (const g of allGraphs(rootGraph)) {
    for (const node of g.nodes) {
      if (node.functionId !== functionId) continue;
      delete node.pins[pinEntryId];
      g.connections = g.connections.filter((c) => !((c.fromNode === node.id && c.fromPin === pinEntryId) || (c.toNode === node.id && c.toPin === pinEntryId)));
    }
  }
}

export function addFunctionInput(fn: FunctionDef, entry: PinSignatureEntry): void {
  fn.inputs.push(entry);
}

export function removeFunctionInput(rootGraph: Graph, fn: FunctionDef, entryId: string): void {
  fn.inputs = fn.inputs.filter((e) => e.id !== entryId);
  pruneDanglingFunctionPinReferences(rootGraph, fn.id, entryId);
}

export function addFunctionOutput(fn: FunctionDef, entry: PinSignatureEntry): void {
  fn.outputs.push(entry);
}

export function removeFunctionOutput(rootGraph: Graph, fn: FunctionDef, entryId: string): void {
  fn.outputs = fn.outputs.filter((e) => e.id !== entryId);
  pruneDanglingFunctionPinReferences(rootGraph, fn.id, entryId);
}

export interface TypedEntryPatch {
  name?: string;
  type?: PinType;
  defaultValue?: unknown;
  container?: PinContainer;
  keyType?: PinType;
  /** Only meaningful when type === "struct" (or "enum") — see PinDef.subType's own doc comment. */
  subType?: string;
}

/** A brand-new default for `type`/`container` — an empty list for any non-"single" container
 * (Array/Set/Map are all backed by a plain array, see PinContainer's own doc comment), the
 * all-fields-defaulted struct value for a "struct" type (see structRegistry.ts), otherwise the
 * plain per-type default. */
export function defaultValueFor(type: PinType, container: PinContainer | undefined, subType?: string): unknown {
  if (container && container !== "single") return [];
  if (type === "struct") {
    const def = subType ? tryGetStructTypeDef(subType) : undefined;
    return def ? defaultStructValue(def) : {};
  }
  return DEFAULT_VALUE_BY_TYPE[type];
}

/** Renames/retypes/revalues a variable in place (global or local — searched across every graph).
 * Changing type, container, or (for a map) key type resets the default value to match (unless a
 * new one is given in the same patch) and disconnects any wires on this variable's Get/Set nodes'
 * value pin across every graph, since the old wire may no longer be type-compatible — mirrors how
 * removing a function input/output prunes now-invalid pin references after a signature change. */
export function updateVariable(rootGraph: Graph, variableId: string, patch: TypedEntryPatch): void {
  const variable = allGraphs(rootGraph)
    .flatMap((g) => g.variables)
    .find((v) => v.id === variableId);
  if (!variable) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== variable.type) ||
    (patch.container !== undefined && patch.container !== variable.container) ||
    (patch.keyType !== undefined && patch.keyType !== variable.keyType) ||
    (patch.subType !== undefined && patch.subType !== variable.subType);
  if (patch.name !== undefined) variable.name = patch.name;
  if (patch.type !== undefined) variable.type = patch.type;
  if (patch.container !== undefined) variable.container = patch.container;
  if (patch.keyType !== undefined) variable.keyType = patch.keyType;
  if (patch.subType !== undefined) variable.subType = patch.subType;
  if (patch.defaultValue !== undefined) variable.defaultValue = patch.defaultValue;
  else if (signatureChanged) variable.defaultValue = defaultValueFor(variable.type, variable.container, variable.subType);

  if (signatureChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = rootGraph.getVisibleVariables(g);
      for (const node of g.nodes) {
        if (node.variableId !== variableId) continue;
        if (node.type === "variable.get") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, "value");
        else if (node.type === "variable.set") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, "value");
      }
    }
  }
}

function updateFunctionEntry(rootGraph: Graph, fn: FunctionDef, entries: PinSignatureEntry[], entryId: string, patch: TypedEntryPatch, disconnectAcrossGraphs: (g: Graph, visibleVariables: Variable[], node: NodeInstance) => void): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== entry.type) ||
    (patch.container !== undefined && patch.container !== entry.container) ||
    (patch.keyType !== undefined && patch.keyType !== entry.keyType) ||
    (patch.subType !== undefined && patch.subType !== entry.subType);
  if (patch.name !== undefined) entry.name = patch.name;
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.container !== undefined) entry.container = patch.container;
  if (patch.keyType !== undefined) entry.keyType = patch.keyType;
  if (patch.subType !== undefined) entry.subType = patch.subType;
  if (patch.defaultValue !== undefined) entry.defaultValue = patch.defaultValue;
  else if (signatureChanged) entry.defaultValue = defaultValueFor(entry.type, entry.container, entry.subType);

  if (signatureChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = rootGraph.getVisibleVariables(g);
      for (const node of g.nodes) {
        if (node.functionId !== fn.id) continue;
        disconnectAcrossGraphs(g, visibleVariables, node);
      }
    }
  }
}

/** Renames/retypes/revalues a function input, live everywhere it's bound (its own Entry node's
 * output pin, and every Call node's matching input pin, across every graph). */
export function updateFunctionInput(rootGraph: Graph, fn: FunctionDef, entryId: string, patch: TypedEntryPatch): void {
  updateFunctionEntry(rootGraph, fn, fn.inputs, entryId, patch, (g, visibleVariables, node) => {
    if (node.type === "function.entry") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts);
    else if (node.type === "function.call") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts);
  });
}

/** Renames/retypes/revalues a function output, live everywhere it's bound (its own Return node's
 * input pin, and every Call node's matching output pin, across every graph). */
export function updateFunctionOutput(rootGraph: Graph, fn: FunctionDef, entryId: string, patch: TypedEntryPatch): void {
  updateFunctionEntry(rootGraph, fn, fn.outputs, entryId, patch, (g, visibleVariables, node) => {
    if (node.type === "function.return") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts);
    else if (node.type === "function.call") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts);
  });
}

// --- Scripts -----------------------------------------------------------------------------------
// A CodeScriptDef (see types.ts) is deliberately much thinner than a FunctionDef: no body graph, no
// Entry/Return nodes — just a name, an inputs/outputs signature, and source/compiledJs text. Only
// one node type (code.run) ever binds to one via NodeInstance.scriptId, so this section is a
// smaller echo of the Functions one above (createFunctionDef/removeFunctionDef/updateFunctionInput
// etc.) rather than a parallel Entry/Return/Call trio — outputs are reported by the script's own
// `run()` returning a { [outputName]: value } object (see code.ts), the exact inverse of how
// inputs already arrive as a name-keyed object, both keyed by the input/output's own plain
// user-facing name (e.g. an input named "PlayerName" is read as `inputs.PlayerName`) — no prefix.

/** Creates a new script with an empty signature and no source yet. Scripts live only on the root
 * graph (rootGraph.scripts), same as functions — never nested inside a function body. */
export function createCodeScriptDef(name: string): CodeScriptDef {
  return {
    id: nextId("script"),
    name,
    source: "",
    compiledJs: "",
    inputs: [],
    outputs: [],
  };
}

const TEMPLATE_INPUT_NAME = "MyInputPin";
const TEMPLATE_OUTPUT_NAME = "MyOutputPin";

/** Real, type-annotated TypeScript — not the plain-JS shortcut an earlier version of this template
 * used — so a freshly created script demonstrates a genuinely type-safe `run()` straight away:
 * `inputs`'s shape (and `log`'s) is spelled out, so mistyping a pin name, or its type, is a red
 * squiggle in the editor rather than a silent `undefined` at run time. Declared `async` (returning
 * a Promise) even though this particular body never actually awaits anything, so the template
 * itself demonstrates the one thing code.ts's execute()/compileExecute() always assume regardless
 * of what the user writes: `run()`'s result is always awaited, whether or not `run` is itself
 * declared `async` — an ordinary, non-async function returning a plain value works exactly the same
 * way through that same `await`, since awaiting a non-Promise value just resolves to it immediately
 * (see code.ts's own test coverage for that guarantee). */
function templateScriptSource(): string {
  return [
    "async function run(",
    "  log: (message: string) => void,",
    `  inputs: { ${TEMPLATE_INPUT_NAME}: string },`,
    `): Promise<{ ${TEMPLATE_OUTPUT_NAME}: string }> {`,
    `  log(inputs.${TEMPLATE_INPUT_NAME});`,
    `  return { ${TEMPLATE_OUTPUT_NAME}: "I am Alive" };`,
    "}",
    "",
  ].join("\n");
}

/** The exact plain-JS equivalent of templateScriptSource() above, with every type annotation
 * removed and nothing else changed — i.e. exactly what engine/transpile.ts's transpileScript would
 * produce from it. Hand-kept in lockstep (verified by createTemplatedCodeScriptDef's own test)
 * rather than actually awaiting the real transpiler at creation time, since that's async and
 * lazily loads the whole `typescript` package on first use — overkill for seeding one fixed,
 * already-known-correct snippet. A real edit-then-Save through scriptEditor.ts re-transpiles this
 * for real, the same as any other script; nothing here bypasses that for anything the user
 * actually changes. */
function templateCompiledJs(): string {
  // 4-space indent to match ts.transpileModule's own printer exactly (verified by
  // createTemplatedCodeScriptDef's own test) — unlike templateScriptSource's 2-space TS, which is
  // just this file's own authored style and irrelevant to what the compiled JS looks like.
  return ["async function run(log, inputs) {", `    log(inputs.${TEMPLATE_INPUT_NAME});`, `    return { ${TEMPLATE_OUTPUT_NAME}: "I am Alive" };`, "}", ""].join("\n");
}

/** Creates a new script pre-seeded with a runnable example, rather than createCodeScriptDef's bare
 * empty shell — one string input (`MyInputPin`, defaulting to "Hello World!") and one string
 * output (`MyOutputPin`), plus a type-safe `source`/`compiledJs` template that logs the input via
 * the `log` it's given and sets the output, so a freshly created script already does something
 * end-to-end instead of starting as a silent no-op. Only used by the Scripts panel's own "+" button
 * (see scriptsPanel.ts) — every other caller that wants a genuinely blank starting point (including
 * every existing test) still uses createCodeScriptDef directly. */
export function createTemplatedCodeScriptDef(name: string): CodeScriptDef {
  const script = createCodeScriptDef(name);
  script.inputs.push({
    id: nextId("io"),
    name: TEMPLATE_INPUT_NAME,
    type: "string",
    defaultValue: "Hello World!",
  });
  script.outputs.push({
    id: nextId("io"),
    name: TEMPLATE_OUTPUT_NAME,
    type: "string",
    defaultValue: "",
  });
  script.source = templateScriptSource();
  script.compiledJs = templateCompiledJs();
  return script;
}

/** Removes a script and any code.run nodes bound to it, across the root graph and every function
 * body (a Code node can appear anywhere, same as a Call node). */
export function removeCodeScriptDef(rootGraph: Graph, scriptId: string): void {
  for (const g of allGraphs(rootGraph)) {
    const variables = rootGraph.getVisibleVariables(g);
    const dependentNodeIds = g.nodes.filter((n) => n.scriptId === scriptId && n.type === "code.run").map((n) => n.id);
    for (const nodeId of dependentNodeIds) {
      g.removeNode(variables, rootGraph.functions, nodeId, rootGraph.scripts);
    }
  }
  rootGraph.scripts = rootGraph.scripts.filter((s) => s.id !== scriptId);
}

export function moveScript(graph: Graph, scriptId: string, targetScriptId: string, position: "before" | "after"): void {
  moveInArray(graph.scripts, scriptId, targetScriptId, position);
}

export function moveScriptInput(script: CodeScriptDef, entryId: string, targetEntryId: string, position: "before" | "after"): void {
  moveInArray(script.inputs, entryId, targetEntryId, position);
}

export function moveScriptOutput(script: CodeScriptDef, entryId: string, targetEntryId: string, position: "before" | "after"): void {
  moveInArray(script.outputs, entryId, targetEntryId, position);
}

export function addScriptInput(script: CodeScriptDef, entry: PinSignatureEntry): void {
  script.inputs.push(entry);
}

export function addScriptOutput(script: CodeScriptDef, entry: PinSignatureEntry): void {
  script.outputs.push(entry);
}

/** Removes any now-dangling pins/connections referencing a since-removed script input, across
 * every graph that could hold a code.run node bound to this script — mirrors
 * pruneDanglingFunctionPinReferences, just for the one node type instead of Entry/Return/Call. */
function pruneDanglingScriptPinReferences(rootGraph: Graph, scriptId: string, pinEntryId: string): void {
  for (const g of allGraphs(rootGraph)) {
    for (const node of g.nodes) {
      if (node.scriptId !== scriptId) continue;
      delete node.pins[pinEntryId];
      g.connections = g.connections.filter((c) => !((c.fromNode === node.id && c.fromPin === pinEntryId) || (c.toNode === node.id && c.toPin === pinEntryId)));
    }
  }
}

export function removeScriptInput(rootGraph: Graph, script: CodeScriptDef, entryId: string): void {
  script.inputs = script.inputs.filter((e) => e.id !== entryId);
  pruneDanglingScriptPinReferences(rootGraph, script.id, entryId);
}

export function removeScriptOutput(rootGraph: Graph, script: CodeScriptDef, entryId: string): void {
  script.outputs = script.outputs.filter((e) => e.id !== entryId);
  pruneDanglingScriptPinReferences(rootGraph, script.id, entryId);
}

/** Shared implementation for updateScriptInput/updateScriptOutput below — mirrors
 * updateFunctionEntry's shape, but scripts have only ONE binding node type (code.run, not an
 * Entry/Return/Call trio), so there's just one disconnect call to make per kind instead of a
 * callback fired per bound node type. */
function updateScriptEntry(rootGraph: Graph, script: CodeScriptDef, entries: PinSignatureEntry[], entryId: string, patch: TypedEntryPatch, disconnect: (g: Graph, visibleVariables: Variable[], node: NodeInstance) => void): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== entry.type) ||
    (patch.container !== undefined && patch.container !== entry.container) ||
    (patch.keyType !== undefined && patch.keyType !== entry.keyType) ||
    (patch.subType !== undefined && patch.subType !== entry.subType);
  if (patch.name !== undefined) entry.name = patch.name;
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.container !== undefined) entry.container = patch.container;
  if (patch.keyType !== undefined) entry.keyType = patch.keyType;
  if (patch.subType !== undefined) entry.subType = patch.subType;
  if (patch.defaultValue !== undefined) entry.defaultValue = patch.defaultValue;
  else if (signatureChanged) entry.defaultValue = defaultValueFor(entry.type, entry.container, entry.subType);

  if (signatureChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = rootGraph.getVisibleVariables(g);
      for (const node of g.nodes) {
        if (node.scriptId !== script.id || node.type !== "code.run") continue;
        disconnect(g, visibleVariables, node);
      }
    }
  }
}

/** Renames/retypes/revalues a script input, live everywhere it's bound (every code.run node's
 * matching input pin, across every graph) — mirrors updateFunctionInput. */
export function updateScriptInput(rootGraph: Graph, script: CodeScriptDef, entryId: string, patch: TypedEntryPatch): void {
  updateScriptEntry(rootGraph, script, script.inputs, entryId, patch, (g, visibleVariables, node) => disconnectPin(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts));
}

/** Renames/retypes/revalues a script output, live everywhere it's bound (every code.run node's
 * matching OUTPUT pin, across every graph) — mirrors updateFunctionOutput. Disconnects any wire
 * LEAVING the pin (disconnectOutput), not one feeding into it, since an output pin is what
 * downstream nodes read from. */
export function updateScriptOutput(rootGraph: Graph, script: CodeScriptDef, entryId: string, patch: TypedEntryPatch): void {
  updateScriptEntry(rootGraph, script, script.outputs, entryId, patch, (g, visibleVariables, node) => disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, entryId, rootGraph.scripts));
}
