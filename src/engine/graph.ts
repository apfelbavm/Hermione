import { cloneDefaultValue } from "./graphMutations";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef } from "./registry";
import type {
  CodeScriptDef,
  CommentBox,
  Connection,
  FunctionDef,
  Pin,
  PinType,
  Variable,
} from "./types";

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

  removeConnection(
    variables: Variable[],
    functions: FunctionDef[],
    connectionId: string,
    scripts: CodeScriptDef[] = [],
  ): void {
    const conn = this.connections.find((c) => c.id === connectionId);
    if (!conn) return;
    this.connections = this.connections.filter((c) => c.id !== connectionId);

    const toNode = this.nodes.find((n) => n.id === conn.toNode);
    const toPin = toNode?.pins[conn.toPin];
    if (toPin) {
      // An exec input pin may still have OTHER incoming wires after this one is removed —
      // only clear connectionId/restore the literal default once none remain.
      const remaining = this.connections.find(
        (c) => c.toNode === conn.toNode && c.toPin === conn.toPin,
      );
      toPin.connectionId = remaining?.id;
      if (!remaining) {
        const pinDef = toNode
          ? toNode
              .resolvePinDefs(variables, functions, scripts)
              .find((p) => p.id === conn.toPin)
          : undefined;
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
  changeNodeElementType(
    variables: Variable[],
    functions: FunctionDef[],
    nodeId: string,
    patch: { elementType?: PinType; mapKeyType?: PinType },
  ): void {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    for (const conn of this.connections.filter(
      (c) => c.fromNode === nodeId || c.toNode === nodeId,
    )) {
      this.removeConnection(variables, functions, conn.id);
    }

    if (patch.elementType !== undefined) node.elementType = patch.elementType;
    if (patch.mapKeyType !== undefined) node.mapKeyType = patch.mapKeyType;

    const pins: Record<string, Pin> = {};
    for (const def of node.resolvePinDefs(variables, functions)) {
      pins[def.id] =
        def.direction === "input"
          ? { value: cloneDefaultValue(def.defaultValue) }
          : {};
    }
    node.pins = pins;
  }
}
