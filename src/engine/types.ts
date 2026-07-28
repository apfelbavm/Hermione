export type PinType = "exec" | "number" | "boolean" | "string" | "object";

/** Orthogonal to PinType (see PinDef.container/Variable.container) — "single" (the default, a
 * plain value of `type`) vs. a collection of `type`. Never a new PinType member: this keeps every
 * exhaustive `Record<PinType, ...>` map (PIN_COLORS, DEFAULT_VALUE_BY_TYPE) untouched, since a
 * container pin still just reuses its element type's color/default — only the pin's drawn SHAPE
 * and its wiring-compatibility rules depend on container (see isPinTypeCompatible, drawPinShape). */
export type PinContainer = "single" | "array" | "set" | "map";

export type PinDirection = "input" | "output";

export interface PinDef {
  id: string;
  label: string;
  /** For a "map" container pin, this is the VALUE type — see keyType for the key. */
  type: PinType;
  direction: PinDirection;
  defaultValue?: unknown;
  /** Marks an entry produced by NodeDef.deriveInstancePins as individually removable via the
   * canvas's right-click "Delete" menu (see removeInstancePin) — e.g. one of Append String's
   * string slots, but never its fixed output pin. */
  removable?: boolean;
  /** A "number" pin whose literal value is always rounded to the nearest whole number — e.g. For
   * Loop's Start/End (see widgetSync.ts). Wiring is unaffected: it stays type "number" so it can
   * still connect to/from any other number pin, this only governs the canvas literal-input widget. */
  integer?: boolean;
  /** A "string" pin restricted to a fixed set of choices, rendered as a <select> dropdown in the
   * canvas literal-input widget instead of a free-text box — e.g. HTTP Request's Method (see
   * widgetSync.ts). Wiring is unaffected: it stays type "string" so it can still connect to/from
   * any other string pin (which may carry a value outside this list — the dropdown only governs
   * how a LITERAL is entered, same relationship `integer` has to "number"). */
  options?: string[];
  /** Defaults to "single" when absent. See PinContainer's own doc comment. */
  container?: PinContainer;
  /** Only meaningful when container === "map" — the map's KEY type (`type` is the value type). */
  keyType?: PinType;
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
  /** Marks every pin this node type declares (own `pins`, or produced by deriveInstancePins) as
   * sharing ONE user-chosen element type (and, if includeKeyType, one key type) per NodeInstance —
   * e.g. Array Length must work on Array<Number> and Array<String> alike, but a node's own `pins`
   * are fixed at registerNode-time, so there's nowhere else for "which type this instance operates
   * on" to live. Consumed via NodeInstance.elementType/mapKeyType by this node's own
   * deriveInstancePins; edited via a "Element Type"/"Key Type" selector in the Details panel (see
   * detailsPanel.ts) instead of a wireable pin, using the same changeNodeElementType mutation a
   * Variable's own type change uses. */
  configurableElementType?: { includeKeyType?: boolean };
  /** Present only on a node whose entries come in linked PAIRS (Make Map's key-N/value-N) — called
   * by removeInstancePin right after it deletes+prunes `removedPinId`, returning any additional pin
   * ids (the paired sibling) that should be deleted+pruned the same way, since the generic
   * right-click "Delete" affordance only ever targets one pin at a time. */
  onInstancePinRemoved?: (node: NodeInstance, removedPinId: string) => string[];
  /** Overrides which exec-out pin(s) fire when a node of this type is disabled (see
   * NodeInstance.disabled) — the generic disabled behavior fires EVERY exec-out pin, since there's
   * normally no execute() result to say which one its own logic would have picked. That default is
   * wrong for a loop node (For Loop, Array/Set/Map For Each): its "loop-body" pin isn't a plain
   * continuation, it's the repeated iteration body, so a disabled loop must skip straight to
   * "completed" and never fire "loop-body" at all — same as if it ran zero iterations. */
  disabledNextExec?: string[];
  /** Marks this node type as inherently "latent" (Unreal's term for a node that genuinely spans
   * real time/multiple ticks rather than completing within the current one) — e.g. Delay, Send
   * Email (mock), HTTP Request. Drawn with a small clock icon in the node's top-right corner (see
   * drawNodes.ts) so it reads at a glance as "this pauses the exec chain," same as Unreal's latent
   * function marker. See also latentBodyPin and src/engine/latency.ts for how this propagates
   * through Call Function / loop nodes that merely CONTAIN a latent node rather than being one. */
  latent?: boolean;
  /** Present only on a node whose OWN exec-out pin(s) represent self-contained sub-chain(s) it
   * re-enters/awaits on the caller's behalf — "loop-body" for For Loop and the Array/Set/Map For
   * Each nodes, or every "then-N" pin for Sequence (hence a function of the instance, not a fixed
   * list — Sequence's pins are dynamic). If any of those sub-chains transitively contains a latent
   * node, this node is ALSO latent (same reasoning as a Function whose body contains one — see
   * src/engine/latency.ts's isNodeLatent/isFunctionLatent) even though the node type itself isn't
   * unconditionally `latent`. */
  latentBodyPins?: (node: NodeInstance) => string[];
  /** Marks this node type as rendered as a small unlabeled "knot" (Unreal's reroute-node look) —
   * no header bar, no label, no literal-value widgets — instead of the normal header+label+pin-rows
   * box (see layout.ts's computeNodeLayout and drawNodes.ts). Currently only core.reroute/
   * core.rerouteExec (see reroute.ts) use this. */
  compact?: boolean;
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
  /** Toggled via the canvas right-click menu (see graphMutations.ts's canToggleDisabled/
   * hasConnectedDataOutput) — a disabled node's execute()/compileExecute() is never invoked, by
   * the interpreter or the compiler, and the exec chain simply doesn't continue past it. */
  disabled?: boolean;
  /** Set only for a node whose NodeDef.configurableElementType is set — see that field's doc
   * comment. Seeded by createNodeInstance, changed via changeNodeElementType. */
  elementType?: PinType;
  /** Set only for a node whose NodeDef.configurableElementType?.includeKeyType is set. */
  mapKeyType?: PinType;
  /** Set only for a "core.reroute" data-reroute node (see reroute.ts) — every other
   * configurableElementType node fixes its container via the node TYPE itself (e.g. array.length is
   * always "array"), but a single generic reroute node type has to mimic single/array/set/map alike
   * depending on whichever wire it gets spliced into (see graphMutations.ts's
   * insertRerouteOnConnection), so its container has to live per-instance too. */
  container?: PinContainer;
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
  /** For a "map" container variable, this is the VALUE type — see keyType for the key. */
  type: PinType;
  defaultValue: unknown;
  /** Defaults to "single" when absent — see PinContainer's own doc comment. */
  container?: PinContainer;
  /** Only meaningful when container === "map". */
  keyType?: PinType;
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
  container?: PinContainer;
  keyType?: PinType;
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
