import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";
import type { CredentialRecord } from "../../credentials/types";

/** "enum" and "struct" both back onto a real registered CLASS looked up by PinDef.subType (see
 * enumRegistry.ts's EnumTypeDef, structRegistry.ts's StructTypeDef) — two pins of either type are
 * wireable exactly when their subType also matches (see isPinTypeCompatible), same as Unreal's own
 * enum/struct pins. An "enum" pin also always shows its own literal dropdown widget (its
 * EnumTypeDef's values — see widgetSync.ts), drawn in its own dark-green color (see
 * Colors.PIN_COLORS) so it visually reads as "pick one, or wire one in." */
export type PinType = "exec" | "number" | "boolean" | "string" | "object" | "date" | "enum" | "struct";

/** Same 4 values debug.ts's "Print (Formatted)" node resolves its own Format pin to (see FORMATS
 * there) — shared here so ExecutionContext.log and server/runLogs.ts's LogEntry both refer to
 * one canonical type instead of two identical unions that could quietly drift apart. */
export type LogFormat = "text" | "json" | "xml" | "csv";

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
  /** Only meaningful when `type` is "enum" or "struct" — which registered enum/struct class this
   * pin is (see structRegistry.ts). Orthogonal to PinType for the same reason `container` is (see
   * PinContainer's own doc comment): keeps every exhaustive `Record<PinType, ...>` map untouched. */
  subType?: string;
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
  /** Resolves a Variable.id to the exact JS reference compiled code should use for it — `this.<field>`
   * for a global, a bare local `let` name for a variable local to the function body currently being
   * compiled. Only ever populated by codegen.ts itself; see variable.ts, the only NodeDef that calls
   * this — every other NodeDef can safely ignore it. */
  resolveVariableRef?: (variableId: string) => string;
}

export interface CompileExecArgs {
  node: NodeInstance;
  inputs: Record<string, string>;
  graph: Graph;
  /** Compiles whatever is wired to this node's given exec-out pin into statements. */
  compileFrom: (execOutPin: string) => string[];
  /** See CompileEvalArgs.resolveVariableRef's own doc comment. */
  resolveVariableRef?: (variableId: string) => string;
}

export interface EventTrigger {
  /** Open string, not a closed union — new trigger kinds (webhook, on-deploy, ...) never require editing this shared file. */
  kind: string;
  describeInstance?: (node: NodeInstance) => Record<string, unknown>;
}

export enum NodeColorCategory {
  Default = 0,
  Events,
  Integration,
  Math,
  Date,
  Boolean,
  Debug,
  Variables,
  String,
  Collections,
}

export interface NodeDef {
  type: string;
  label: string;
  /** Shown as a hover tooltip (after resting ~0.5s) both over this node's box on the canvas and
   * over its entry in the create-node menu — see overlay/tooltip.ts/nodeTooltip.ts. A one-sentence
   * summary of what the node does, since `label` alone often isn't enough (e.g. distinguishing
   * "Less equal" from "Less than" at a glance). */
  description: string;
  /** Where this node appears in the node-creation menu, e.g. "Math" or "Math.Comparison" for a nested subgroup. */
  group: string;
  /** The node header's fixed background color category (see NodeColorCategory above) — omit for
   * the neutral default grey. A node bound to a Variable (Get/Set) ignores this entirely and
   * colors by the variable's own TYPE instead (see drawNodes.ts's resolveNodeHeaderColor). */
  colorCategory?: NodeColorCategory;
  pins: PinDef[];
  execute?: (args: ExecuteArgs) => Promise<ExecuteResult> | ExecuteResult;
  evaluate?: (args: EvaluateArgs) => Record<string, unknown> | Promise<Record<string, unknown>>;
  derivePins?: (variable: Variable) => PinDef[];
  /** Sibling of derivePins for the Entry/Return/Call function nodes, dispatched off NodeInstance.functionId. */
  deriveFunctionPins?: (fn: FunctionDef) => PinDef[];
  /** Sibling of derivePins/deriveFunctionPins for the Code node, dispatched off NodeInstance.scriptId. */
  deriveScriptPins?: (script: CodeScriptDef) => PinDef[];
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
  /** For a latent/exec node whose `execute()` returns MORE than one data output (e.g. an HTTP-calling
   * node's success/error/status/etc): maps each data output pin id to a JS expression a downstream
   * node's compileEvaluate can embed. Unlike compileEvaluate (safe to call anywhere, any number of
   * times, since it's pure), these expressions are only valid to reference from statements compiled
   * to run AFTER this node's own compileExecute in the same exec chain — by convention, each is a
   * reference into a local variable that compileExecute itself declared (see compileResultVar),
   * never a fresh computation, since re-running the actual side-effecting call per reference would
   * be wrong. compileFrom's downstream walk already guarantees the ordering: compileExecute's
   * returned statements always precede whatever `compileFrom(execOutPin)` appends after them. */
  compileExecuteOutputs?: (args: {
    node: NodeInstance;
    /** Needed only by a node whose output SHAPE is derived from bound data rather than fixed (e.g.
     * code.run's outputs come from its bound CodeScriptDef, looked up via node.scriptId) — every
     * fixed-shape node (http.request, etc.) can safely ignore this. */
    graph: Graph;
  }) => Record<string, string>;
  /** Named helper-function source snippets this node's generated code depends on (e.g. `delay`), deduped by name across the whole compiled file. */
  compileHelpers?: Record<string, string>;
  /** Literal ESM import statements this node's generated code depends on (e.g. `import { XMLParser } from
   * "fast-xml-parser";`), deduped verbatim across the whole compiled file and hoisted above every
   * compileHelpers source. Unlike compileHelpers, this makes the compiled .mjs no longer
   * dependency-free — running it requires `npm install` the referenced package alongside it — so
   * this is reserved for logic (e.g. real XML parsing) too involved to reasonably hand-roll as a
   * portable helper string. */
  compileImports?: string[];
  /** Marks every pin this node type declares (own `pins`, or produced by deriveInstancePins) as
   * sharing ONE user-chosen element type (and, if includeKeyType, one key type) per NodeInstance —
   * e.g. Array Length must work on Array<Number> and Array<String> alike, but a node's own `pins`
   * are fixed at registerNode-time, so there's nowhere else for "which type this instance operates
   * on" to live. Consumed via NodeInstance.elementType/mapKeyType by this node's own
   * deriveInstancePins; edited via a "Element Type"/"Key Type" selector in the Details panel (see
   * detailsPanel.ts) instead of a wireable pin, using the same changeNodeElementType mutation a
   * Variable's own type change uses. */
  configurableElementType?: { includeKeyType?: boolean };
  /** Sibling of configurableElementType for a node whose pins all key off one user-chosen struct
   * CLASS instead of one element type — currently only struct.make/struct.break (see nodes/struct.ts).
   * Consumed via NodeInstance.subType by this node's own deriveInstancePins; edited via a "Struct
   * Type" selector in the Details panel, using the same changeNodeSubType mutation
   * changeNodeElementType's sibling. `kind` is forward-looking (only "struct" exists today) so a
   * future non-struct subType family doesn't need a whole new NodeDef flag. */
  configurableSubType?: { kind: "struct" };
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
  /** Shrinks the node's whole body down to just its header/title bar — no separate pin-row area
   * below it — with its pin(s) drawn vertically centered within that header instead of below it
   * (see layout.ts's computeNodeLayout and drawNodes.ts). Unlike `compact` (reroute's borderless
   * "knot" look), the header/title bar, its gradient, and the node's border/selection ring are all
   * still drawn normally — just at the header's own height. Meant for a node whose title already
   * says everything there is to say about its one pin (currently only variable.get — see
   * nodes/variable.ts), so the pin-row space below the title would otherwise sit empty. */
  headerOnly?: boolean;
}

export interface Pin {
  value?: unknown;
  connectionId?: string;
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
  /** Only meaningful when `type` is "enum" or "struct" — see PinDef.subType's own doc comment.
   * Edited via the Add Variable UI's type select (see createTypeSelect's includeStructsAndEnums). */
  subType?: string;
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
  /** Only meaningful when `type` is "enum" or "struct" — see PinDef.subType's own doc comment. */
  subType?: string;
}

/** A user-defined function: its own typed signature plus its own body graph (whose `variables`
 * field holds this function's LOCAL variables — the body is a real Graph so every render/
 * interaction/persistence function that already operates on `Graph` works on it unmodified). */
export interface FunctionDef {
  id: string;
  name: string;
  /** User-authored, edited in the Details panel (see detailsPanel.ts) — shown as the hover tooltip
   * over this function's Call node(s) on the canvas and its row in the Functions sidebar list,
   * taking over from the generic "Call Function" NodeDef.description when set (see
   * NodeInstance.resolveNodeDescription). Absent/empty for a function that hasn't been given one. */
  description?: string;
  inputs: PinSignatureEntry[];
  outputs: PinSignatureEntry[];
  body: Graph;
}

/** A user-authored, named, reusable script — bound to one or more Code (code.run) nodes via
 * NodeInstance.scriptId, the same way a FunctionDef is bound to Entry/Return/Call nodes via
 * functionId. Unlike a function, a script has no body GRAPH of its own (no nested nodes/wires) —
 * its "body" is `source`, plain text edited in a Monaco tab. `inputs` become code.run's own input
 * pins, passed to `run()` as a name-keyed object; `outputs` become code.run's own OUTPUT pins,
 * populated from whatever object `run()` returns, keyed the same way — the exact inverse direction
 * (see code.ts's namedInputsFor/pinOutputsFor). `source` is what the user edits/sees; `compiledJs`
 * is the last successful transpile of it (see engine/transpile.ts), computed once at Save time
 * rather than on every run/compile, and is what execute()/compileExecute() actually embed and call
 * — so a script with unsaved edits (or one that's never been saved) keeps running/compiling against
 * its last-known-good `compiledJs` instead of silently doing nothing or re-transpiling on every
 * single execution. */
export interface CodeScriptDef {
  id: string;
  name: string;
  source: string;
  compiledJs: string;
  inputs: PinSignatureEntry[];
  outputs: PinSignatureEntry[];
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
  /** `format` mirrors debug.ts's "Print (Formatted)" node's own Format pin — omitted (plain "Print")
   * means plain text. Threaded through to the Logs page (see server/runLogs.ts's LogEntry, which
   * reuses this same LogFormat type) so it can render each entry accordingly instead of just
   * dumping monospace text for everything. */
  log: (message: string, format?: LogFormat) => void;
  /** May return a Promise to introduce a visualization pause between exec steps; awaited by the executor. */
  onNodeStart?: (nodeId: string) => void | Promise<void>;
  onExecFire?: (connectionId: string) => void;
  /** Looks up a Credential Vault entry by name (see src/server/credentials.ts's getCredentialByName,
   * wired in by /api/simulate/route.ts) — only meaningful server-side, where the interpreter can
   * actually reach the vault database; a node using this (currently just auth.oauth2Saml — see
   * nodes/oauth2Saml.ts) has no equivalent for the COMPILED path, which instead reads the same
   * credential's fields from environment variables at runtime (see that node's compileHelpers). */
  getCredential?: (name: string) => CredentialRecord | undefined;
  /** Fired whenever a node's data OUTPUT pins get a fresh value — both when an exec node's own
   * execute() produces them, and when a pure/data node's evaluate() runs to satisfy some downstream
   * pin read (see executor.ts's runExecFrom/resolveDataPin) — so a client watching a live run can
   * show "what's currently on this pin" (see nodeTooltip.ts's hover tooltip) without re-deriving the
   * engine's own evaluation order itself. */
  onPinValues?: (nodeId: string, values: Record<string, unknown>) => void;
}
