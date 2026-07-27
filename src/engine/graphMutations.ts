import { getNodeDef, isPinTypeCompatible } from "./registry";
import type {
  CommentBox,
  Connection,
  FunctionDef,
  Graph,
  NodeDef,
  NodeInstance,
  Pin,
  PinDef,
  PinSignatureEntry,
  PinType,
  Variable,
} from "./types";
import { createEmptyGraph } from "./types";

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
};

export function createNodeInstance(
  type: string,
  position: { x: number; y: number },
  pinDefs: PinDef[],
  id: string = nextId("node"),
  variableId?: string,
  functionId?: string,
): NodeInstance {
  // detailProperties are seeded here (not passed in by the caller) since every caller already
  // identifies the node purely by `type` — looking them up off the registered NodeDef keeps every
  // call site from having to remember to merge them in separately.
  const detailProperties = getNodeDef(type).detailProperties ?? [];
  const pins: Record<string, Pin> = {};
  for (const def of [...pinDefs, ...detailProperties]) {
    pins[def.id] = def.direction === "input" ? { value: def.defaultValue } : {};
  }
  return { id, type, position, pins, variableId, functionId };
}

/** Resolves the pin defs for a node instance, accounting for variable-derived (Get/Set) nodes
 * and function-derived (Entry/Return/Call) nodes. */
export function resolvePinDefs(node: NodeInstance, variables: Variable[], functions: FunctionDef[]): PinDef[] {
  const def = getNodeDef(node.type);
  if (def.derivePins && node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) return def.derivePins(variable);
  }
  if (def.deriveFunctionPins && node.functionId) {
    const fn = functions.find((f) => f.id === node.functionId);
    if (fn) return def.deriveFunctionPins(fn);
  }
  if (def.deriveInstancePins) return def.deriveInstancePins(node);
  return def.pins;
}

/** The display label for a node instance — normally its NodeDef's static label, except: a node
 * bound to a Variable (Get/Set) shows "Get "/"Set " followed by that variable's name (so the graph
 * reads e.g. "Get Score", not the generic "Get Variable" — its own pin is left unlabeled since the
 * title already says it), and a function.call node shows the name of the function it's bound to
 * (so the graph reads e.g. "Double", not the generic "Call Function"), matching how its pins
 * already reflect that function. */
export function resolveNodeLabel(node: NodeInstance, def: NodeDef, variables: Variable[], functions: FunctionDef[]): string {
  if (node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) {
      if (node.type === "variable.get") return `Get ${variable.name}`;
      if (node.type === "variable.set") return `Set ${variable.name}`;
      return variable.name;
    }
  }
  if (node.type === "function.call" && node.functionId) {
    const fn = functions.find((f) => f.id === node.functionId);
    if (fn) return fn.name;
  }
  return def.label;
}

/** All variables visible from `currentGraph`: just the root's if editing the root itself, or
 * root (global) + currentGraph's own (local) if currentGraph is a function's body. Functions
 * themselves are never merged this way — they're always looked up straight from rootGraph.functions,
 * since a function's own body.functions field is unused (functions are never nested). */
export function getVisibleVariables(rootGraph: Graph, currentGraph: Graph): Variable[] {
  if (currentGraph === rootGraph) return rootGraph.variables;
  return [...rootGraph.variables, ...currentGraph.variables];
}

export function addNode(graph: Graph, node: NodeInstance): void {
  graph.nodes.push(node);
}

/** True if a node of this type is allowed to be placed into `graph` right now — trivially true for
 * any non-event node type. An event node (see NodeDef.eventTrigger — On Start/On Interval/On Run)
 * may only live in the root graph, never inside a function body, and at most one instance of each
 * event TYPE may exist per graph, mirroring how Unreal only allows one BeginPlay/EventTick per
 * Blueprint. Used to filter both the node-creation menu and paste. */
export function canPlaceNodeType(type: string, graph: Graph, isFunctionBody: boolean): boolean {
  const def = getNodeDef(type);
  if (!def.eventTrigger) return true;
  if (isFunctionBody) return false;
  return !graph.nodes.some((n) => n.type === type);
}

/** True if this node's canvas right-click menu should offer a Disable/Enable toggle at all — it
 * must have at least one execution pin (a pure data node has no "code" to skip) and must not be an
 * event trigger (an entry point always has to be reachable). Whether disabling is CURRENTLY
 * allowed (vs. greyed out) is a separate question — see hasConnectedDataOutput. */
export function canToggleDisabled(node: NodeInstance, variables: Variable[], functions: FunctionDef[]): boolean {
  const def = getNodeDef(node.type);
  if (def.eventTrigger) return false;
  return resolvePinDefs(node, variables, functions).some((p) => p.type === "exec");
}

/** True if any of this node's DATA (non-exec) output pins feeds something else. A node can only be
 * disabled while this is false — disabling it anyway would silently starve whatever's downstream of
 * a real value, since a disabled node's execute()/evaluate() never runs. Re-enabling has no such
 * restriction, so this only gates the "Disable" direction of the toggle, not "Enable". */
export function hasConnectedDataOutput(
  graph: Graph,
  nodeId: string,
  variables: Variable[],
  functions: FunctionDef[],
): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const dataOutputIds = new Set(
    resolvePinDefs(node, variables, functions)
      .filter((p) => p.direction === "output" && p.type !== "exec")
      .map((p) => p.id),
  );
  return graph.connections.some((c) => c.fromNode === nodeId && dataOutputIds.has(c.fromPin));
}

/** Entry and Return nodes are structural — a function body must always be able to receive its
 * inputs and produce its outputs, so these two types can never be removed via removeNode (not
 * even by the user's own Delete key). Callers that legitimately clean up OTHER node types bound to
 * a variable/function (removeVariable, removeFunctionDef) never target these types, so this guard
 * doesn't interfere with them. */
export const UNDELETABLE_NODE_TYPES = new Set(["function.entry", "function.return"]);

export function removeNode(graph: Graph, variables: Variable[], functions: FunctionDef[], nodeId: string): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || UNDELETABLE_NODE_TYPES.has(node.type)) return;

  // Prune every connection touching this node through removeConnection (not a raw array filter) so
  // whichever OTHER node sat on the far end of an outgoing wire gets its input pin properly
  // restored to a literal default — a raw filter would leave that pin's connectionId dangling and
  // its value stuck at whatever it was mid-connection (undefined, surfacing as a stray "null"),
  // never falling back to a real default the way an explicit disconnect already does.
  for (const conn of graph.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId)) {
    removeConnection(graph, variables, functions, conn.id);
  }

  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  for (const box of graph.commentBoxes) {
    box.containedNodeIds = box.containedNodeIds.filter((id) => id !== nodeId);
  }
}

/** Removes one entry pin from a node with an expandable, user-editable pin list (see
 * NodeDef.deriveInstancePins) — deletes its Pin record and prunes any connection touching it.
 * Generic across every such node type; which of its derived pins are eligible for this is up to
 * that node type's own deriveInstancePins (see PinDef.removable), not this function. */
export function removeInstancePin(graph: Graph, nodeId: string, pinId: string): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  delete node.pins[pinId];
  graph.connections = graph.connections.filter(
    (c) => !((c.fromNode === nodeId && c.fromPin === pinId) || (c.toNode === nodeId && c.toPin === pinId)),
  );
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
export function connectPins(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  req: ConnectRequest,
): Connection {
  const fromNode = graph.nodes.find((n) => n.id === req.fromNode);
  const toNode = graph.nodes.find((n) => n.id === req.toNode);
  if (!fromNode || !toNode) throw new Error("connectPins: node not found");

  const fromPinDef = resolvePinDefs(fromNode, variables, functions).find((p) => p.id === req.fromPin);
  const toPinDef = resolvePinDefs(toNode, variables, functions).find((p) => p.id === req.toPin);
  if (!fromPinDef || !toPinDef) throw new Error("connectPins: pin not found");
  if (fromPinDef.direction !== "output" || toPinDef.direction !== "input") {
    throw new Error("connectPins: must connect an output pin to an input pin");
  }
  if (!isPinTypeCompatible(fromPinDef.type, toPinDef.type)) {
    throw new Error(
      `connectPins: incompatible pin types "${fromPinDef.type}" -> "${toPinDef.type}"`,
    );
  }

  if (toPinDef.type === "exec") {
    // Exec pins invert the data-pin rule: an input may converge many incoming wires (several
    // branches can all lead to the same next step), but a single output can only ever drive
    // ONE next step — replace any existing wire leaving this output instead.
    disconnectOutput(graph, variables, functions, req.fromNode, req.fromPin);
  } else {
    // Data pins: an input takes exactly one source; an output may fan out to many freely.
    disconnectPin(graph, variables, functions, req.toNode, req.toPin);
  }

  const connection: Connection = { id: nextId("conn"), ...req };
  graph.connections.push(connection);

  const toPin = toNode.pins[req.toPin] ?? (toNode.pins[req.toPin] = {});
  toPin.connectionId = connection.id;
  toPin.value = undefined;

  return connection;
}

/** Removes the (first) connection feeding the given input pin, if any, restoring its literal default. */
export function disconnectPin(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  pinId: string,
): void {
  const existing = graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
  if (!existing) return;
  removeConnection(graph, variables, functions, existing.id);
}

/** Removes the connection leaving the given output pin, if any — enforces "one wire per exec output." */
export function disconnectOutput(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  pinId: string,
): void {
  const existing = graph.connections.find((c) => c.fromNode === nodeId && c.fromPin === pinId);
  if (!existing) return;
  removeConnection(graph, variables, functions, existing.id);
}

export function removeConnection(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  connectionId: string,
): void {
  const conn = graph.connections.find((c) => c.id === connectionId);
  if (!conn) return;
  graph.connections = graph.connections.filter((c) => c.id !== connectionId);

  const toNode = graph.nodes.find((n) => n.id === conn.toNode);
  const toPin = toNode?.pins[conn.toPin];
  if (toPin) {
    // An exec input pin may still have OTHER incoming wires after this one is removed —
    // only clear connectionId/restore the literal default once none remain.
    const remaining = graph.connections.find(
      (c) => c.toNode === conn.toNode && c.toPin === conn.toPin,
    );
    toPin.connectionId = remaining?.id;
    if (!remaining) {
      const pinDef = toNode
        ? resolvePinDefs(toNode, variables, functions).find((p) => p.id === conn.toPin)
        : undefined;
      toPin.value = pinDef?.defaultValue;
    }
  }
}

export function addVariable(graph: Graph, variable: Variable): void {
  graph.variables.push(variable);
}

/** Removes a variable along with any Get/Set nodes bound to it — an orphaned binding has no valid
 * pins. `variables`/`functions` must be the full VISIBLE sets for `graph` (see getVisibleVariables)
 * so removeNode can correctly restore a literal default on whatever was downstream of a removed
 * Get node's output. */
export function removeVariable(graph: Graph, variables: Variable[], functions: FunctionDef[], variableId: string): void {
  const dependentNodeIds = graph.nodes.filter((n) => n.variableId === variableId).map((n) => n.id);
  for (const nodeId of dependentNodeIds) {
    removeNode(graph, variables, functions, nodeId);
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
  const body = createEmptyGraph(nextId("fnbody"), name);
  const fn: FunctionDef = { id, name, inputs: [], outputs: [], body };

  const entryDef = getNodeDef("function.entry");
  const entryPins = entryDef.deriveFunctionPins ? entryDef.deriveFunctionPins(fn) : entryDef.pins;
  const entryNode = createNodeInstance("function.entry", { x: 40, y: 120 }, entryPins, nextId("node"), undefined, fn.id);
  body.nodes.push(entryNode);

  const returnDef = getNodeDef("function.return");
  const returnPins = returnDef.deriveFunctionPins ? returnDef.deriveFunctionPins(fn) : returnDef.pins;
  const returnNode = createNodeInstance("function.return", { x: 360, y: 120 }, returnPins, nextId("node"), undefined, fn.id);
  body.nodes.push(returnNode);

  return fn;
}

/** Removes a function and any Call nodes bound to it, across the root graph and every other
 * function's body (Call nodes can appear anywhere, including inside other functions). */
export function removeFunctionDef(rootGraph: Graph, functionId: string): void {
  for (const g of allGraphs(rootGraph)) {
    const variables = getVisibleVariables(rootGraph, g);
    const dependentNodeIds = g.nodes
      .filter((n) => n.functionId === functionId && n.type === "function.call")
      .map((n) => n.id);
    for (const nodeId of dependentNodeIds) {
      removeNode(g, variables, rootGraph.functions, nodeId);
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
      g.connections = g.connections.filter(
        (c) =>
          !(
            (c.fromNode === node.id && c.fromPin === pinEntryId) ||
            (c.toNode === node.id && c.toPin === pinEntryId)
          ),
      );
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
}

/** Renames/retypes/revalues a variable in place (global or local — searched across every graph).
 * Changing type resets the default value to match (unless a new one is given in the same patch)
 * and disconnects any wires on this variable's Get/Set nodes' value pin across every graph, since
 * the old wire may no longer be type-compatible — mirrors how removing a function input/output
 * prunes now-invalid pin references after a signature change. */
export function updateVariable(rootGraph: Graph, variableId: string, patch: TypedEntryPatch): void {
  const variable = allGraphs(rootGraph)
    .flatMap((g) => g.variables)
    .find((v) => v.id === variableId);
  if (!variable) return;

  const typeChanged = patch.type !== undefined && patch.type !== variable.type;
  if (patch.name !== undefined) variable.name = patch.name;
  if (patch.type !== undefined) variable.type = patch.type;
  if (patch.defaultValue !== undefined) variable.defaultValue = patch.defaultValue;
  else if (typeChanged) variable.defaultValue = DEFAULT_VALUE_BY_TYPE[variable.type];

  if (typeChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = getVisibleVariables(rootGraph, g);
      for (const node of g.nodes) {
        if (node.variableId !== variableId) continue;
        if (node.type === "variable.get") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, "value");
        else if (node.type === "variable.set") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, "value");
      }
    }
  }
}

function updateFunctionEntry(
  rootGraph: Graph,
  fn: FunctionDef,
  entries: PinSignatureEntry[],
  entryId: string,
  patch: TypedEntryPatch,
  disconnectAcrossGraphs: (g: Graph, visibleVariables: Variable[], node: NodeInstance) => void,
): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  const typeChanged = patch.type !== undefined && patch.type !== entry.type;
  if (patch.name !== undefined) entry.name = patch.name;
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.defaultValue !== undefined) entry.defaultValue = patch.defaultValue;
  else if (typeChanged) entry.defaultValue = DEFAULT_VALUE_BY_TYPE[entry.type];

  if (typeChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = getVisibleVariables(rootGraph, g);
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
    if (node.type === "function.entry") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, entryId);
    else if (node.type === "function.call") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, entryId);
  });
}

/** Renames/retypes/revalues a function output, live everywhere it's bound (its own Return node's
 * input pin, and every Call node's matching output pin, across every graph). */
export function updateFunctionOutput(rootGraph: Graph, fn: FunctionDef, entryId: string, patch: TypedEntryPatch): void {
  updateFunctionEntry(rootGraph, fn, fn.outputs, entryId, patch, (g, visibleVariables, node) => {
    if (node.type === "function.return") disconnectPin(g, visibleVariables, rootGraph.functions, node.id, entryId);
    else if (node.type === "function.call") disconnectOutput(g, visibleVariables, rootGraph.functions, node.id, entryId);
  });
}
