export type PinType = "exec" | "number" | "boolean" | "string" | "object";

export type PinDirection = "input" | "output";

export interface PinDef {
  id: string;
  label: string;
  type: PinType;
  direction: PinDirection;
  defaultValue?: unknown;
  /** Marks an entry produced by NodeDef.deriveInstancePins as individually removable via the
   * canvas's right-click "Delete" menu (see removeInstancePin) — e.g. one of Append String's
   * string slots, but never its fixed output pin. */
  removable?: boolean;
}

export interface ExecuteResult {
  nextExec?: string | string[];
  /** Data this exec node produces on its own output pins (e.g. a function call's results), readable
   * by whatever's wired next in the same exec chain via the normal data-pin resolution machinery. */
  outputs?: Record<string, unknown>;
}

export interface ExecuteArgs {
  node: NodeInstance;
  inputs: Record<string, unknown>;
  ctx: ExecutionContext;
}

export interface EvaluateArgs {
  node: NodeInstance;
  inputs: Record<string, unknown>;
  ctx: ExecutionContext;
}

export interface CompileEvalArgs {
  node: NodeInstance;
  inputs: Record<string, string>;
  graph: Graph;
}

export interface CompileExecArgs {
  node: NodeInstance;
  inputs: Record<string, string>;
  graph: Graph;
  /** Compiles whatever is wired to this node's given exec-out pin into statements. */
  compileFrom: (execOutPin: string) => string[];
}

export interface EventTrigger {
  /** Open string, not a closed union — new trigger kinds (webhook, on-deploy, ...) never require editing this shared file. */
  kind: string;
  describeInstance?: (node: NodeInstance) => Record<string, unknown>;
}

export interface NodeDef {
  type: string;
  label: string;
  /** Where this node appears in the node-creation menu, e.g. "Math" or "Math.Comparison" for a nested subgroup. */
  group: string;
  pins: PinDef[];
  execute?: (args: ExecuteArgs) => Promise<ExecuteResult> | ExecuteResult;
  evaluate?: (
    args: EvaluateArgs,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  derivePins?: (variable: Variable) => PinDef[];
  /** Sibling of derivePins for the Entry/Return/Call function nodes, dispatched off NodeInstance.functionId. */
  deriveFunctionPins?: (fn: FunctionDef) => PinDef[];
  /** Sibling of derivePins/deriveFunctionPins for a node whose pin list depends on data stored
   * directly on its own NodeInstance — e.g. Append String's expandable list of string inputs —
   * rather than a bound Variable/FunctionDef. */
  deriveInstancePins?: (node: NodeInstance) => PinDef[];
  /** Present only on a deriveInstancePins node: mutates `node.pins` in place to add one more
   * entry. Invoked by the canvas "+" affordance drawn next to the node (see NodeLayout.addButton). */
  addInstancePinEntry?: (node: NodeInstance) => void;
  /** Instance-level configuration edited in the sidebar Details panel when this node is selected
   * on the canvas (see detailsPanel.ts) — e.g. On Interval's interval duration — instead of as a
   * wireable pin. Storage still goes through NodeInstance.pins (same as any other pin's value);
   * these ids are simply never returned by resolvePinDefs, so they're never drawn, wired, or given
   * an inline canvas widget like a real pin would be. */
  detailProperties?: PinDef[];
  /** Marks this node type as a graph entry point (Unreal's BeginPlay/EventTick equivalent). */
  eventTrigger?: EventTrigger;
  /** Compile-time counterpart of `evaluate`: returns a JS expression string per output pin. */
  compileEvaluate?: (args: CompileEvalArgs) => Record<string, string>;
  /** Compile-time counterpart of `execute`: returns JS statement strings. */
  compileExecute?: (args: CompileExecArgs) => string[];
  /** Named helper-function source snippets this node's generated code depends on (e.g. `delay`), deduped by name across the whole compiled file. */
  compileHelpers?: Record<string, string>;
}

export interface Pin {
  value?: unknown;
  connectionId?: string;
}

export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  pins: Record<string, Pin>;
  variableId?: string;
  /** Binds this node to a FunctionDef — used by function.entry/return/call, sibling to variableId. */
  functionId?: string;
}

export interface Connection {
  id: string;
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}

export interface Variable {
  id: string;
  name: string;
  type: PinType;
  defaultValue: unknown;
}

export interface CommentBox {
  id: string;
  text: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  containedNodeIds: string[];
  color?: string;
}

/** One entry in a function's input or output signature — behaves like a Variable (name, type,
 * default value) but lives on a FunctionDef rather than a Graph. */
export interface PinSignatureEntry {
  id: string;
  name: string;
  type: PinType;
  defaultValue: unknown;
}

/** A user-defined function: its own typed signature plus its own body graph (whose `variables`
 * field holds this function's LOCAL variables — the body is a real Graph so every render/
 * interaction/persistence function that already operates on `Graph` works on it unmodified). */
export interface FunctionDef {
  id: string;
  name: string;
  inputs: PinSignatureEntry[];
  outputs: PinSignatureEntry[];
  body: Graph;
}

export interface Graph {
  id: string;
  name: string;
  nodes: NodeInstance[];
  connections: Connection[];
  variables: Variable[];
  commentBoxes: CommentBox[];
  functions: FunctionDef[];
}

export interface ExecutionContext {
  /** The graph currently being walked — swapped to a function's body inside a nested call. */
  graph: Graph;
  /** Stable reference to the true top-level graph, never swapped — lets a nested call still
   * resolve global variables and look up other FunctionDefs to call. */
  rootGraph: Graph;
  tickCache: Map<string, unknown>;
  /** Data produced by exec nodes' own execute() (e.g. a function call's results) on their output
   * pins, readable by whatever's wired next in the same exec chain. Unlike tickCache, NOT cleared
   * per exec-step — a call's outputs must survive until the very next step reads them. */
  execOutputs: Map<string, unknown>;
  /** Current value of each GLOBAL variable (by Variable.id) for the lifetime of this execution run. */
  variableValues: Map<string, unknown>;
  /** Current call frame's LOCAL variables — fresh per nested function call, never shared/shared-and-restored. */
  localVariableValues?: Map<string, unknown>;
  /** Nesting depth of function calls so far — guards against unbounded (self-)recursion. */
  callDepth: number;
  /** Set only inside a function-body walk: the resolved argument values this specific call passed in. */
  entryArgs?: Record<string, unknown>;
  /** Set only inside a function-body walk: called by function.return with its resolved input values. */
  onReturn?: (values: Record<string, unknown>) => void;
  log: (message: string) => void;
  /** May return a Promise to introduce a visualization pause between exec steps; awaited by the executor. */
  onNodeStart?: (nodeId: string) => void | Promise<void>;
  onExecFire?: (connectionId: string) => void;
}

export function createEmptyGraph(id: string, name: string): Graph {
  return { id, name, nodes: [], connections: [], variables: [], commentBoxes: [], functions: [] };
}
