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

export interface NodeDef {
  type: string;
  label: string;
  category: string;
  pins: PinDef[];
  execute?: (args: ExecuteArgs) => Promise<ExecuteResult> | ExecuteResult;
  evaluate?: (
    args: EvaluateArgs,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  derivePins?: (variable: Variable) => PinDef[];
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
