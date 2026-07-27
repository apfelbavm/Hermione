export type PinType = "exec" | "number" | "boolean" | "string" | "object";

export type PinDirection = "input" | "output";

export interface PinDef {
  id: string;
  label: string;
  type: PinType;
  direction: PinDirection;
  defaultValue?: unknown;
}

export interface ExecuteResult {
  nextExec?: string | string[];
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

export interface Graph {
  id: string;
  name: string;
  nodes: NodeInstance[];
  connections: Connection[];
  variables: Variable[];
  commentBoxes: CommentBox[];
}

export interface ExecutionContext {
  graph: Graph;
  tickCache: Map<string, unknown>;
  /** Current value of each variable (by Variable.id) for the lifetime of this execution run. */
  variableValues: Map<string, unknown>;
  log: (message: string) => void;
  /** May return a Promise to introduce a visualization pause between exec steps; awaited by the executor. */
  onNodeStart?: (nodeId: string) => void | Promise<void>;
  onExecFire?: (connectionId: string) => void;
}

export function createEmptyGraph(id: string, name: string): Graph {
  return { id, name, nodes: [], connections: [], variables: [], commentBoxes: [] };
}
