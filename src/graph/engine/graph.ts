import { cloneDefaultValue } from "./graphMutations.ts";
import { NodeInstance } from "./nodeInstance.ts";
import { getNodeDef } from "./registry.ts";
import type { CodeScriptDef, CommentBox, Connection, FunctionDef, Pin, PinType, Variable } from "./types.ts";

export class Graph {
  id: string;
  name: string;
  nodes: NodeInstance[];
  connections: Connection[];
  variables: Variable[];
  commentBoxes: CommentBox[];
  functions: FunctionDef[];
  scripts: CodeScriptDef[];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.nodes = [];
    this.connections = [];
    this.variables = [];
    this.commentBoxes = [];
    this.functions = [];
    this.scripts = [];
  }

  addNode(node: NodeInstance): void {
    this.nodes.push(node);
  }

  /** All variables visible from `currentGraph`: just the root's if editing the root itself, or
   * root (global) + currentGraph's own (local) if currentGraph is a function's body. Functions
   * themselves are never merged this way — they're always looked up straight from rootGraph.functions,
   * since a function's own body.functions field is unused (functions are never nested). */
  getVisibleVariables(currentGraph: Graph): Variable[] {
    if (currentGraph === this) return this.variables;
    return [...this.variables, ...currentGraph.variables];
  }

  /** True if a node of this type is allowed to be placed into `graph` right now — trivially true for
   * any non-event node type. An event node (see NodeDef.eventTrigger — On Start/On Interval/On Run)
   * may only live in the root graph, never inside a function body, and at most one instance of each
   * event TYPE may exist per graph, mirroring how Unreal only allows one BeginPlay/EventTick per
   * Blueprint. Used to filter both the node-creation menu and paste. */
  canPlaceNodeType(type: string, isFunctionBody: boolean): boolean {
    const def = getNodeDef(type);
    if (!def.eventTrigger) return true;
    if (isFunctionBody) return false;
    return !this.nodes.some((n) => n.type === type);
  }

  removeConnection(variables: Variable[], functions: FunctionDef[], connectionId: string, scripts: CodeScriptDef[] = []): void {
    const conn = this.connections.find((c) => c.id === connectionId);
    if (!conn) return;
    this.connections = this.connections.filter((c) => c.id !== connectionId);

    const toNode = this.nodes.find((n) => n.id === conn.toNode);
    const toPin = toNode?.pins[conn.toPin];
    if (toPin) {
      // An exec input pin may still have OTHER incoming wires after this one is removed —
      // only clear connectionId/restore the literal default once none remain.
      const remaining = this.connections.find((c) => c.toNode === conn.toNode && c.toPin === conn.toPin);
      toPin.connectionId = remaining?.id;
      if (!remaining) {
        const pinDef = toNode ? toNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === conn.toPin) : undefined;
        toPin.value = cloneDefaultValue(pinDef?.defaultValue);
      }
    }
  }

  /** Changes a configurableElementType node instance's element/key type (see
   * NodeDef.configurableElementType) — e.g. an Array Length node switching from operating on
   * Array<Number> to Array<String>. Every pin on such a node shares the one parameterized type, so
   * (unlike a Variable, which only disconnects its single Get/Set value pin on a type change) this
   * disconnects EVERY connection touching the node, applies the patch, then rebuilds every pin fresh
   * from the now-current (post-patch) pin defs — deriveInstancePins reads the still-intact `node.pins`
   * keys for arity (e.g. how many Make Array entries existed) before they're replaced, so entry COUNT
   * survives a type change even though each entry's stored value resets to the new type's default. */
  changeNodeElementType(variables: Variable[], functions: FunctionDef[], nodeId: string, patch: { elementType?: PinType; elementSubType?: string; mapKeyType?: PinType }): void {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    for (const conn of this.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId)) {
      this.removeConnection(variables, functions, conn.id);
    }

    if (patch.elementType !== undefined) node.elementType = patch.elementType;
    if (patch.elementSubType !== undefined) node.elementSubType = patch.elementSubType;
    if (patch.mapKeyType !== undefined) node.mapKeyType = patch.mapKeyType;

    const pins: Record<string, Pin> = {};
    for (const def of node.resolvePinDefs(variables, functions)) {
      pins[def.id] = def.direction === "input" ? { value: cloneDefaultValue(def.defaultValue) } : {};
    }
    node.pins = pins;
  }

  /** Sibling of changeNodeElementType for a configurableSubType node instance (see
   * NodeDef.configurableSubType) — e.g. a Make/Break Struct node switching which struct class it
   * builds/inspects. Same "disconnect everything, patch, rebuild every pin fresh" shape, since here
   * too every pin the node has depends on the one chosen value. */
  changeNodeSubType(variables: Variable[], functions: FunctionDef[], nodeId: string, subType: string): void {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    for (const conn of this.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId)) {
      this.removeConnection(variables, functions, conn.id);
    }

    node.subType = subType;

    const pins: Record<string, Pin> = {};
    for (const def of node.resolvePinDefs(variables, functions)) {
      pins[def.id] = def.direction === "input" ? { value: cloneDefaultValue(def.defaultValue) } : {};
    }
    node.pins = pins;
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
  hasConnectedDataOutput(nodeId: string, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): boolean {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (getNodeDef(node.type).disabledNextExec) return false;
    const dataOutputIds = new Set(
      node
        .resolvePinDefs(variables, functions, scripts)
        .filter((p) => p.direction === "output" && p.type !== "exec")
        .map((p) => p.id),
    );
    return this.connections.some((c) => c.fromNode === nodeId && dataOutputIds.has(c.fromPin));
  }

  /** Entry and Return nodes are structural — a function body must always be able to receive its
   * inputs and produce its outputs, so these two types can never be removed via removeNode (not
   * even by the user's own Delete key). Callers that legitimately clean up OTHER node types bound to
   * a variable/function (removeVariable, removeFunctionDef) never target these types, so this guard
   * doesn't interfere with them. */
  static UNDELETABLE_NODE_TYPES = new Set(["function.entry", "function.return"]);

  removeNode(variables: Variable[], functions: FunctionDef[], nodeId: string, scripts: CodeScriptDef[] = []): void {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node || Graph.UNDELETABLE_NODE_TYPES.has(node.type)) return;

    // Prune every connection touching this node through removeConnection (not a raw array filter) so
    // whichever OTHER node sat on the far end of an outgoing wire gets its input pin properly
    // restored to a literal default — a raw filter would leave that pin's connectionId dangling and
    // its value stuck at whatever it was mid-connection (undefined, surfacing as a stray "null"),
    // never falling back to a real default the way an explicit disconnect already does.
    for (const conn of this.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId)) {
      this.removeConnection(variables, functions, conn.id, scripts);
    }

    this.nodes = this.nodes.filter((n) => n.id !== nodeId);
    for (const box of this.commentBoxes) {
      box.containedNodeIds = box.containedNodeIds.filter((id) => id !== nodeId);
    }
  }
}
