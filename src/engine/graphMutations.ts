import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef, isPinTypeCompatible } from "./registry";
import type {
  CodeScriptDef,
  CommentBox,
  Connection,
  FunctionDef,
  NodeDef,
  Pin,
  PinContainer,
  PinDef,
  PinSignatureEntry,
  PinType,
  Variable,
} from "./types";

/** Seed element/key type for a freshly-created configurableElementType node instance (see
 * NodeDef.configurableElementType) — arbitrary but consistent defaults, same spirit as
 * variablePanel.ts/functionIoPanel.ts always defaulting a brand-new Variable/PinSignatureEntry to
 * type "number". */
const DEFAULT_ELEMENT_TYPE: PinType = "number";
const DEFAULT_KEY_TYPE: PinType = "string";

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
};

export function createNodeInstance(
  type: string,
  position: { x: number; y: number },
  pinDefs: PinDef[],
  id: string = nextId("node"),
  variableId?: string,
  functionId?: string,
  scriptId?: string,
): NodeInstance {
  // detailProperties are seeded here (not passed in by the caller) since every caller already
  // identifies the node purely by `type` — looking them up off the registered NodeDef keeps every
  // call site from having to remember to merge them in separately.
  const def = getNodeDef(type);
  const detailProperties = def.detailProperties ?? [];
  const pins: Record<string, Pin> = {};
  for (const entry of [...pinDefs, ...detailProperties]) {
    pins[entry.id] =
      entry.direction === "input"
        ? { value: cloneDefaultValue(entry.defaultValue) }
        : {};
  }
  const node: NodeInstance = {
    id,
    type,
    position,
    pins,
    variableId,
    functionId,
    scriptId,
  };
  if (def.configurableElementType) {
    node.elementType = DEFAULT_ELEMENT_TYPE;
    if (def.configurableElementType.includeKeyType)
      node.mapKeyType = DEFAULT_KEY_TYPE;
  }
  return node;
}

/** Resolves the pin defs for a node instance, accounting for variable-derived (Get/Set) nodes,
 * function-derived (Entry/Return/Call) nodes, and script-derived (Code) nodes. */
export function resolvePinDefs(
  node: NodeInstance,
  variables: Variable[],
  functions: FunctionDef[],
  scripts: CodeScriptDef[] = [],
): PinDef[] {
  const def = getNodeDef(node.type);
  if (def.derivePins && node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) return def.derivePins(variable);
  }
  if (def.deriveFunctionPins && node.functionId) {
    const fn = functions.find((f) => f.id === node.functionId);
    if (fn) return def.deriveFunctionPins(fn);
  }
  if (def.deriveScriptPins && node.scriptId) {
    const script = scripts.find((s) => s.id === node.scriptId);
    if (script) return def.deriveScriptPins(script);
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
export function resolveNodeLabel(
  node: NodeInstance,
  def: NodeDef,
  variables: Variable[],
  functions: FunctionDef[],
  scripts: CodeScriptDef[] = [],
): string {
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
  if (node.type === "code.run" && node.scriptId) {
    const script = scripts.find((s) => s.id === node.scriptId);
    if (script) return script.name;
  }
  return def.label;
}

/** All variables visible from `currentGraph`: just the root's if editing the root itself, or
 * root (global) + currentGraph's own (local) if currentGraph is a function's body. Functions
 * themselves are never merged this way — they're always looked up straight from rootGraph.functions,
 * since a function's own body.functions field is unused (functions are never nested). */
export function getVisibleVariables(
  rootGraph: Graph,
  currentGraph: Graph,
): Variable[] {
  if (currentGraph === rootGraph) return rootGraph.variables;
  return [...rootGraph.variables, ...currentGraph.variables];
}



/** True if a node of this type is allowed to be placed into `graph` right now — trivially true for
 * any non-event node type. An event node (see NodeDef.eventTrigger — On Start/On Interval/On Run)
 * may only live in the root graph, never inside a function body, and at most one instance of each
 * event TYPE may exist per graph, mirroring how Unreal only allows one BeginPlay/EventTick per
 * Blueprint. Used to filter both the node-creation menu and paste. */
export function canPlaceNodeType(
  type: string,
  graph: Graph,
  isFunctionBody: boolean,
): boolean {
  const def = getNodeDef(type);
  if (!def.eventTrigger) return true;
  if (isFunctionBody) return false;
  return !graph.nodes.some((n) => n.type === type);
}

/** True if this node's canvas right-click menu should offer a Disable/Enable toggle at all — it
 * must have at least one execution pin (a pure data node has no "code" to skip) and must not be an
 * event trigger (an entry point always has to be reachable). Whether disabling is CURRENTLY
 * allowed (vs. greyed out) is a separate question — see hasConnectedDataOutput. */
export function canToggleDisabled(
  node: NodeInstance,
  variables: Variable[],
  functions: FunctionDef[],
  scripts: CodeScriptDef[] = [],
): boolean {
  const def = getNodeDef(node.type);
  if (def.eventTrigger) return false;
  return resolvePinDefs(node, variables, functions, scripts).some(
    (p) => p.type === "exec",
  );
}

/** True if any of this node's DATA (non-exec) output pins feeds something else. A node can only be
 * disabled while this is false — disabling it anyway would silently starve whatever's downstream of
 * a real value, since a disabled node's execute()/evaluate() never runs. Re-enabling has no such
 * restriction, so this only gates the "Disable" direction of the toggle, not "Enable".
 *
 * Exempt: a loop node (NodeDef.disabledNextExec set — For Loop, Array/Set/Map For Each). Its data
 * outputs (index, element, key, value) are only ever meaningfully read from within its OWN
 * loop-body chain, which itself never runs once disabled — there's no downstream consumer left
 * "silently starved," since that consumer never executes at all. Without this exemption, disabling
 * a loop would be blocked in virtually every real graph, since wiring index/element/key/value into
 * the loop body is the entire point of using one. */
export function hasConnectedDataOutput(
  graph: Graph,
  nodeId: string,
  variables: Variable[],
  functions: FunctionDef[],
  scripts: CodeScriptDef[] = [],
): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  if (getNodeDef(node.type).disabledNextExec) return false;
  const dataOutputIds = new Set(
    resolvePinDefs(node, variables, functions, scripts)
      .filter((p) => p.direction === "output" && p.type !== "exec")
      .map((p) => p.id),
  );
  return graph.connections.some(
    (c) => c.fromNode === nodeId && dataOutputIds.has(c.fromPin),
  );
}

/** Entry and Return nodes are structural — a function body must always be able to receive its
 * inputs and produce its outputs, so these two types can never be removed via removeNode (not
 * even by the user's own Delete key). Callers that legitimately clean up OTHER node types bound to
 * a variable/function (removeVariable, removeFunctionDef) never target these types, so this guard
 * doesn't interfere with them. */
export const UNDELETABLE_NODE_TYPES = new Set([
  "function.entry",
  "function.return",
]);

export function removeNode(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  scripts: CodeScriptDef[] = [],
): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || UNDELETABLE_NODE_TYPES.has(node.type)) return;

  // Prune every connection touching this node through removeConnection (not a raw array filter) so
  // whichever OTHER node sat on the far end of an outgoing wire gets its input pin properly
  // restored to a literal default — a raw filter would leave that pin's connectionId dangling and
  // its value stuck at whatever it was mid-connection (undefined, surfacing as a stray "null"),
  // never falling back to a real default the way an explicit disconnect already does.
  for (const conn of graph.connections.filter(
    (c) => c.fromNode === nodeId || c.toNode === nodeId,
  )) {
    removeConnection(graph, variables, functions, conn.id, scripts);
  }

  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  for (const box of graph.commentBoxes) {
    box.containedNodeIds = box.containedNodeIds.filter((id) => id !== nodeId);
  }
}

/** Removes one entry pin from a node with an expandable, user-editable pin list (see
 * NodeDef.deriveInstancePins) — deletes its Pin record and prunes any connection touching it.
 * Generic across every such node type; which of its derived pins are eligible for this is up to
 * that node type's own deriveInstancePins (see PinDef.removable), not this function. Afterward,
 * gives the node type a chance (NodeDef.onInstancePinRemoved) to also remove a linked sibling pin —
 * e.g. Make Map's key-N when its paired value-N is the one actually deleted — since this function
 * only ever targets one pin id per call. Guards against a hook that (incorrectly) names a pin
 * that's already gone, so it can never loop. */
export function removeInstancePin(
  graph: Graph,
  nodeId: string,
  pinId: string,
  visited: Set<string> = new Set(),
): void {
  if (visited.has(pinId)) return;
  visited.add(pinId);

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || !(pinId in node.pins)) return;
  delete node.pins[pinId];
  graph.connections = graph.connections.filter(
    (c) =>
      !(
        (c.fromNode === nodeId && c.fromPin === pinId) ||
        (c.toNode === nodeId && c.toPin === pinId)
      ),
  );

  const extraPinIds =
    getNodeDef(node.type).onInstancePinRemoved?.(node, pinId) ?? [];
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
export function connectPins(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  req: ConnectRequest,
  scripts: CodeScriptDef[] = [],
): Connection {
  const fromNode = graph.nodes.find((n) => n.id === req.fromNode);
  const toNode = graph.nodes.find((n) => n.id === req.toNode);
  if (!fromNode || !toNode) throw new Error("connectPins: node not found");

  const fromPinDef = resolvePinDefs(
    fromNode,
    variables,
    functions,
    scripts,
  ).find((p) => p.id === req.fromPin);
  const toPinDef = resolvePinDefs(toNode, variables, functions, scripts).find(
    (p) => p.id === req.toPin,
  );
  if (!fromPinDef || !toPinDef) throw new Error("connectPins: pin not found");
  if (fromPinDef.direction !== "output" || toPinDef.direction !== "input") {
    throw new Error("connectPins: must connect an output pin to an input pin");
  }
  if (!isPinTypeCompatible(fromPinDef, toPinDef)) {
    throw new Error(
      `connectPins: incompatible pin types "${fromPinDef.type}" -> "${toPinDef.type}"`,
    );
  }

  if (toPinDef.type === "exec") {
    // Exec pins invert the data-pin rule: an input may converge many incoming wires (several
    // branches can all lead to the same next step), but a single output can only ever drive
    // ONE next step — replace any existing wire leaving this output instead.
    disconnectOutput(
      graph,
      variables,
      functions,
      req.fromNode,
      req.fromPin,
      scripts,
    );
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
export function disconnectPin(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  pinId: string,
  scripts: CodeScriptDef[] = [],
): void {
  const existing = graph.connections.find(
    (c) => c.toNode === nodeId && c.toPin === pinId,
  );
  if (!existing) return;
  removeConnection(graph, variables, functions, existing.id, scripts);
}

/** Removes the connection leaving the given output pin, if any — enforces "one wire per exec output." */
export function disconnectOutput(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  pinId: string,
  scripts: CodeScriptDef[] = [],
): void {
  const existing = graph.connections.find(
    (c) => c.fromNode === nodeId && c.fromPin === pinId,
  );
  if (!existing) return;
  removeConnection(graph, variables, functions, existing.id, scripts);
}

export function removeConnection(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  connectionId: string,
  scripts: CodeScriptDef[] = [],
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
        ? resolvePinDefs(toNode, variables, functions, scripts).find(
            (p) => p.id === conn.toPin,
          )
        : undefined;
      toPin.value = cloneDefaultValue(pinDef?.defaultValue);
    }
  }
}

/** Splices a "Reroute" node (see reroute.ts) into an existing connection — Unreal's "Add Reroute
 * Node," used purely to bend a wire's path on the canvas; it changes nothing about what the graph
 * actually does. The new node's pin type is frozen to match the connection's own source pin
 * exactly (see NodeInstance.elementType/container/mapKeyType) — this engine has no wildcard/
 * inferred-from-wiring pin type (resolvePinDefs has no visibility into graph.connections by
 * design), so this is the one place a concrete type is available to seed it with; that's also
 * exactly why reroute nodes are never offered from the generic node-creation menus (see main.ts) —
 * only this call site has a wire to read a type off of. */
export function insertRerouteOnConnection(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  connectionId: string,
  position: { x: number; y: number },
  scripts: CodeScriptDef[] = [],
): void {
  const conn = graph.connections.find((c) => c.id === connectionId);
  if (!conn) return;
  const fromNode = graph.nodes.find((n) => n.id === conn.fromNode);
  if (!fromNode) return;
  const fromPinDef = resolvePinDefs(
    fromNode,
    variables,
    functions,
    scripts,
  ).find((p) => p.id === conn.fromPin);
  if (!fromPinDef) return;

  const isExec = fromPinDef.type === "exec";
  const rerouteType = isExec ? "core.rerouteExec" : "core.reroute";
  const reroute = createNodeInstance(
    rerouteType,
    position,
    getNodeDef(rerouteType).pins,
  );
  if (!isExec) {
    reroute.elementType = fromPinDef.type;
    reroute.container = fromPinDef.container;
    reroute.mapKeyType = fromPinDef.keyType;
  }
  graph.nodes.push(reroute);

  const inPinId = isExec ? "exec-in" : "in";
  const outPinId = isExec ? "exec-out" : "out";
  const {
    fromNode: origFromNode,
    fromPin: origFromPin,
    toNode: origToNode,
    toPin: origToPin,
  } = conn;

  // Removed first (rather than relying on connectPins' own auto-disconnect) because an exec input
  // may legally converge several incoming wires — connectPins would happily add the reroute's exec
  // path ALONGSIDE the original one instead of replacing it (see connectPins' own comment on why
  // it only auto-prunes the FROM side for exec, the TO side for data).
  removeConnection(graph, variables, functions, connectionId, scripts);
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
function moveInArray<T extends { id: string }>(
  arr: T[],
  id: string,
  targetId: string,
  position: "before" | "after",
): void {
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

export function moveVariable(
  graph: Graph,
  variableId: string,
  targetVariableId: string,
  position: "before" | "after",
): void {
  moveInArray(graph.variables, variableId, targetVariableId, position);
}

export function moveFunction(
  graph: Graph,
  functionId: string,
  targetFunctionId: string,
  position: "before" | "after",
): void {
  moveInArray(graph.functions, functionId, targetFunctionId, position);
}

/** Reorders a function's Inputs or Outputs signature list (whichever `kind` names). */
export function moveFunctionEntry(
  fn: FunctionDef,
  kind: "input" | "output",
  entryId: string,
  targetEntryId: string,
  position: "before" | "after",
): void {
  moveInArray(
    kind === "input" ? fn.inputs : fn.outputs,
    entryId,
    targetEntryId,
    position,
  );
}

/** Removes a variable along with any Get/Set nodes bound to it — an orphaned binding has no valid
 * pins. `variables`/`functions` must be the full VISIBLE sets for `graph` (see getVisibleVariables)
 * so removeNode can correctly restore a literal default on whatever was downstream of a removed
 * Get node's output. */
export function removeVariable(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  variableId: string,
  scripts: CodeScriptDef[] = [],
): void {
  const dependentNodeIds = graph.nodes
    .filter((n) => n.variableId === variableId)
    .map((n) => n.id);
  for (const nodeId of dependentNodeIds) {
    removeNode(graph, variables, functions, nodeId, scripts);
  }
  graph.variables = graph.variables.filter((v) => v.id !== variableId);
}

export function addCommentBox(graph: Graph, box: CommentBox): void {
  graph.commentBoxes.push(box);
}

export function removeCommentBox(graph: Graph, commentId: string): void {
  graph.commentBoxes = graph.commentBoxes.filter((b) => b.id !== commentId);
}

export function setPinLiteralValue(
  graph: Graph,
  nodeId: string,
  pinId: string,
  value: unknown,
): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`setPinLiteralValue: node "${nodeId}" not found`);
  const pin = node.pins[pinId] ?? (node.pins[pinId] = {});
  if (pin.connectionId) {
    throw new Error(
      `setPinLiteralValue: pin "${nodeId}:${pinId}" is connected, disconnect first`,
    );
  }
  pin.value = value;
}

/** Changes a configurableElementType node instance's element/key type (see
 * NodeDef.configurableElementType) — e.g. an Array Length node switching from operating on
 * Array<Number> to Array<String>. Every pin on such a node shares the one parameterized type, so
 * (unlike a Variable, which only disconnects its single Get/Set value pin on a type change) this
 * disconnects EVERY connection touching the node, applies the patch, then rebuilds every pin fresh
 * from the now-current (post-patch) pin defs — deriveInstancePins reads the still-intact `node.pins`
 * keys for arity (e.g. how many Make Array entries existed) before they're replaced, so entry COUNT
 * survives a type change even though each entry's stored value resets to the new type's default. */
export function changeNodeElementType(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  nodeId: string,
  patch: { elementType?: PinType; mapKeyType?: PinType },
): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  for (const conn of graph.connections.filter(
    (c) => c.fromNode === nodeId || c.toNode === nodeId,
  )) {
    removeConnection(graph, variables, functions, conn.id);
  }

  if (patch.elementType !== undefined) node.elementType = patch.elementType;
  if (patch.mapKeyType !== undefined) node.mapKeyType = patch.mapKeyType;

  const pins: Record<string, Pin> = {};
  for (const def of resolvePinDefs(node, variables, functions)) {
    pins[def.id] =
      def.direction === "input"
        ? { value: cloneDefaultValue(def.defaultValue) }
        : {};
  }
  node.pins = pins;
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
  const entryPins = entryDef.deriveFunctionPins
    ? entryDef.deriveFunctionPins(fn)
    : entryDef.pins;
  const entryNode = createNodeInstance(
    "function.entry",
    { x: 40, y: 120 },
    entryPins,
    nextId("node"),
    undefined,
    fn.id,
  );
  body.nodes.push(entryNode);

  const returnDef = getNodeDef("function.return");
  const returnPins = returnDef.deriveFunctionPins
    ? returnDef.deriveFunctionPins(fn)
    : returnDef.pins;
  const returnNode = createNodeInstance(
    "function.return",
    { x: 360, y: 120 },
    returnPins,
    nextId("node"),
    undefined,
    fn.id,
  );
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
function pruneDanglingFunctionPinReferences(
  rootGraph: Graph,
  functionId: string,
  pinEntryId: string,
): void {
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

export function addFunctionInput(
  fn: FunctionDef,
  entry: PinSignatureEntry,
): void {
  fn.inputs.push(entry);
}

export function removeFunctionInput(
  rootGraph: Graph,
  fn: FunctionDef,
  entryId: string,
): void {
  fn.inputs = fn.inputs.filter((e) => e.id !== entryId);
  pruneDanglingFunctionPinReferences(rootGraph, fn.id, entryId);
}

export function addFunctionOutput(
  fn: FunctionDef,
  entry: PinSignatureEntry,
): void {
  fn.outputs.push(entry);
}

export function removeFunctionOutput(
  rootGraph: Graph,
  fn: FunctionDef,
  entryId: string,
): void {
  fn.outputs = fn.outputs.filter((e) => e.id !== entryId);
  pruneDanglingFunctionPinReferences(rootGraph, fn.id, entryId);
}

export interface TypedEntryPatch {
  name?: string;
  type?: PinType;
  defaultValue?: unknown;
  container?: PinContainer;
  keyType?: PinType;
}

/** A brand-new default for `type`/`container` — an empty list for any non-"single" container
 * (Array/Set/Map are all backed by a plain array, see PinContainer's own doc comment), otherwise
 * the plain per-type default. */
function defaultValueFor(
  type: PinType,
  container: PinContainer | undefined,
): unknown {
  return container && container !== "single" ? [] : DEFAULT_VALUE_BY_TYPE[type];
}

/** Renames/retypes/revalues a variable in place (global or local — searched across every graph).
 * Changing type, container, or (for a map) key type resets the default value to match (unless a
 * new one is given in the same patch) and disconnects any wires on this variable's Get/Set nodes'
 * value pin across every graph, since the old wire may no longer be type-compatible — mirrors how
 * removing a function input/output prunes now-invalid pin references after a signature change. */
export function updateVariable(
  rootGraph: Graph,
  variableId: string,
  patch: TypedEntryPatch,
): void {
  const variable = allGraphs(rootGraph)
    .flatMap((g) => g.variables)
    .find((v) => v.id === variableId);
  if (!variable) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== variable.type) ||
    (patch.container !== undefined && patch.container !== variable.container) ||
    (patch.keyType !== undefined && patch.keyType !== variable.keyType);
  if (patch.name !== undefined) variable.name = patch.name;
  if (patch.type !== undefined) variable.type = patch.type;
  if (patch.container !== undefined) variable.container = patch.container;
  if (patch.keyType !== undefined) variable.keyType = patch.keyType;
  if (patch.defaultValue !== undefined)
    variable.defaultValue = patch.defaultValue;
  else if (signatureChanged)
    variable.defaultValue = defaultValueFor(variable.type, variable.container);

  if (signatureChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = getVisibleVariables(rootGraph, g);
      for (const node of g.nodes) {
        if (node.variableId !== variableId) continue;
        if (node.type === "variable.get")
          disconnectOutput(
            g,
            visibleVariables,
            rootGraph.functions,
            node.id,
            "value",
          );
        else if (node.type === "variable.set")
          disconnectPin(
            g,
            visibleVariables,
            rootGraph.functions,
            node.id,
            "value",
          );
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
  disconnectAcrossGraphs: (
    g: Graph,
    visibleVariables: Variable[],
    node: NodeInstance,
  ) => void,
): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== entry.type) ||
    (patch.container !== undefined && patch.container !== entry.container) ||
    (patch.keyType !== undefined && patch.keyType !== entry.keyType);
  if (patch.name !== undefined) entry.name = patch.name;
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.container !== undefined) entry.container = patch.container;
  if (patch.keyType !== undefined) entry.keyType = patch.keyType;
  if (patch.defaultValue !== undefined) entry.defaultValue = patch.defaultValue;
  else if (signatureChanged)
    entry.defaultValue = defaultValueFor(entry.type, entry.container);

  if (signatureChanged) {
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
export function updateFunctionInput(
  rootGraph: Graph,
  fn: FunctionDef,
  entryId: string,
  patch: TypedEntryPatch,
): void {
  updateFunctionEntry(
    rootGraph,
    fn,
    fn.inputs,
    entryId,
    patch,
    (g, visibleVariables, node) => {
      if (node.type === "function.entry")
        disconnectOutput(
          g,
          visibleVariables,
          rootGraph.functions,
          node.id,
          entryId,
          rootGraph.scripts,
        );
      else if (node.type === "function.call")
        disconnectPin(
          g,
          visibleVariables,
          rootGraph.functions,
          node.id,
          entryId,
          rootGraph.scripts,
        );
    },
  );
}

/** Renames/retypes/revalues a function output, live everywhere it's bound (its own Return node's
 * input pin, and every Call node's matching output pin, across every graph). */
export function updateFunctionOutput(
  rootGraph: Graph,
  fn: FunctionDef,
  entryId: string,
  patch: TypedEntryPatch,
): void {
  updateFunctionEntry(
    rootGraph,
    fn,
    fn.outputs,
    entryId,
    patch,
    (g, visibleVariables, node) => {
      if (node.type === "function.return")
        disconnectPin(
          g,
          visibleVariables,
          rootGraph.functions,
          node.id,
          entryId,
          rootGraph.scripts,
        );
      else if (node.type === "function.call")
        disconnectOutput(
          g,
          visibleVariables,
          rootGraph.functions,
          node.id,
          entryId,
          rootGraph.scripts,
        );
    },
  );
}

// --- Scripts -----------------------------------------------------------------------------------
// A CodeScriptDef (see types.ts) is deliberately much thinner than a FunctionDef: no body graph, no
// Entry/Return nodes, no outputs — just a name, an inputs signature, and source/compiledJs text.
// Only one node type (code.run) ever binds to one via NodeInstance.scriptId, so this section is a
// smaller echo of the Functions one above (createFunctionDef/removeFunctionDef/updateFunctionInput
// etc.) rather than a parallel Entry/Return/Call trio.

/** Creates a new script with an empty signature and no source yet. Scripts live only on the root
 * graph (rootGraph.scripts), same as functions — never nested inside a function body. */
export function createCodeScriptDef(name: string): CodeScriptDef {
  return { id: nextId("script"), name, source: "", compiledJs: "", inputs: [] };
}

/** Removes a script and any code.run nodes bound to it, across the root graph and every function
 * body (a Code node can appear anywhere, same as a Call node). */
export function removeCodeScriptDef(rootGraph: Graph, scriptId: string): void {
  for (const g of allGraphs(rootGraph)) {
    const variables = getVisibleVariables(rootGraph, g);
    const dependentNodeIds = g.nodes
      .filter((n) => n.scriptId === scriptId && n.type === "code.run")
      .map((n) => n.id);
    for (const nodeId of dependentNodeIds) {
      removeNode(g, variables, rootGraph.functions, nodeId, rootGraph.scripts);
    }
  }
  rootGraph.scripts = rootGraph.scripts.filter((s) => s.id !== scriptId);
}

export function moveScript(
  graph: Graph,
  scriptId: string,
  targetScriptId: string,
  position: "before" | "after",
): void {
  moveInArray(graph.scripts, scriptId, targetScriptId, position);
}

export function moveScriptInput(
  script: CodeScriptDef,
  entryId: string,
  targetEntryId: string,
  position: "before" | "after",
): void {
  moveInArray(script.inputs, entryId, targetEntryId, position);
}

export function addScriptInput(
  script: CodeScriptDef,
  entry: PinSignatureEntry,
): void {
  script.inputs.push(entry);
}

/** Removes any now-dangling pins/connections referencing a since-removed script input, across
 * every graph that could hold a code.run node bound to this script — mirrors
 * pruneDanglingFunctionPinReferences, just for the one node type instead of Entry/Return/Call. */
function pruneDanglingScriptPinReferences(
  rootGraph: Graph,
  scriptId: string,
  pinEntryId: string,
): void {
  for (const g of allGraphs(rootGraph)) {
    for (const node of g.nodes) {
      if (node.scriptId !== scriptId) continue;
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

export function removeScriptInput(
  rootGraph: Graph,
  script: CodeScriptDef,
  entryId: string,
): void {
  script.inputs = script.inputs.filter((e) => e.id !== entryId);
  pruneDanglingScriptPinReferences(rootGraph, script.id, entryId);
}

/** Renames/retypes/revalues a script input, live everywhere it's bound (every code.run node's
 * matching input pin, across every graph) — mirrors updateFunctionInput. */
export function updateScriptInput(
  rootGraph: Graph,
  script: CodeScriptDef,
  entryId: string,
  patch: TypedEntryPatch,
): void {
  const entry = script.inputs.find((e) => e.id === entryId);
  if (!entry) return;

  const signatureChanged =
    (patch.type !== undefined && patch.type !== entry.type) ||
    (patch.container !== undefined && patch.container !== entry.container) ||
    (patch.keyType !== undefined && patch.keyType !== entry.keyType);
  if (patch.name !== undefined) entry.name = patch.name;
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.container !== undefined) entry.container = patch.container;
  if (patch.keyType !== undefined) entry.keyType = patch.keyType;
  if (patch.defaultValue !== undefined) entry.defaultValue = patch.defaultValue;
  else if (signatureChanged)
    entry.defaultValue = defaultValueFor(entry.type, entry.container);

  if (signatureChanged) {
    for (const g of allGraphs(rootGraph)) {
      const visibleVariables = getVisibleVariables(rootGraph, g);
      for (const node of g.nodes) {
        if (node.scriptId !== script.id || node.type !== "code.run") continue;
        disconnectPin(
          g,
          visibleVariables,
          rootGraph.functions,
          node.id,
          entryId,
          rootGraph.scripts,
        );
      }
    }
  }
}
