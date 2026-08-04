import type { PinContainer, PinDirection, PinType } from "../engine/types";

/** AI-facing view of one port (pin) on a node TYPE — generated from PinDef, never hand-duplicated. */
export interface PortMetadata {
  id: string;
  label: string;
  direction: PinDirection;
  type: PinType;
  container?: PinContainer;
  keyType?: PinType;
  subType?: string;
  defaultValue?: unknown;
  /** Allowed literal choices, e.g. an enum's option ids or a "string" pin's fixed dropdown list. */
  options?: string[];
  integer?: boolean;
  removable?: boolean;
  /** True for an exec input (must be wired to run at all) — a data input always falls back to its
   * own literal defaultValue, so it's never "required" in the same sense. */
  required: boolean;
  /** Whether this port can legally carry more than one connection at once: every data output and
   * every exec input can fan-in/out; a data input and an exec output each accept exactly one wire. */
  allowsMultipleConnections: boolean;
}

export interface NodeTypeMetadata {
  type: string;
  label: string;
  description: string;
  group: string;
  category: string;
  colorCategory?: number;
  ports: PortMetadata[];
  detailProperties: PortMetadata[];
  isEventTrigger: boolean;
  eventKind?: string;
  latent?: boolean;
  compact?: boolean;
  headerOnly?: boolean;
  hasVariableBinding: boolean;
  hasFunctionBinding: boolean;
  hasScriptBinding: boolean;
  configurableElementType: boolean;
  configurableSubType: boolean;
  editableInputs: boolean;
  editableOutputs: boolean;
}

export interface NodeSummary {
  id: string;
  type: string;
  label: string;
  category: string;
  position: { x: number; y: number };
  disabled: boolean;
  hasBreakpoint: boolean;
}

export interface ConnectionDTO {
  id: string;
  source: { nodeId: string; port: string };
  target: { nodeId: string; port: string };
}

export interface PortInstance {
  id: string;
  label: string;
  direction: PinDirection;
  type: PinType;
  value?: unknown;
  connectionId?: string;
}

export interface NodeDetail extends NodeSummary {
  description?: string;
  properties: Record<string, unknown>;
  ports: PortInstance[];
  connections: ConnectionDTO[];
  metadata: NodeTypeMetadata;
  validation: ValidationError[];
}

export interface GraphSummary {
  graphId: string;
  graphName: string;
  nodeCount: number;
  connectionCount: number;
  groups: string[];
  validation: ValidationResult;
  version: number;
  selectedNodeIds: string[];
}

export type ValidationErrorCode =
  | "TYPE_MISMATCH"
  | "MISSING_REQUIRED_PROPERTY"
  | "UNKNOWN_PROPERTY"
  | "INVALID_PROPERTY_TYPE"
  | "INVALID_ENUM_VALUE"
  | "DANGLING_CONNECTION"
  | "UNKNOWN_NODE_TYPE"
  | "UNKNOWN_NODE"
  | "UNKNOWN_PORT"
  | "PORT_DIRECTION_MISMATCH"
  | "INCOMPATIBLE_PORTS"
  | "MULTIPLE_CONNECTIONS_NOT_ALLOWED"
  | "DATA_CYCLE"
  | "DEPENDENT_CONNECTIONS_EXIST"
  | "DUPLICATE_EVENT_TRIGGER"
  | "VERSION_CONFLICT"
  | "INVALID_OPERATION"
  | "UNKNOWN_TEMP_ID";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  nodeId?: string;
  port?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// --- Mutation / transaction ops -----------------------------------------------------------------

export interface CreateNodeOp {
  op: "create_node";
  tempId?: string;
  nodeType: string;
  properties?: Record<string, unknown>;
  position?: { x: number; y: number };
  config?: { elementType?: PinType; elementSubType?: string; mapKeyType?: PinType; subType?: string };
  /** Sets NodeInstance.description — a per-instance note shown on the canvas, distinct from the
   * node TYPE's static NodeDef.description (see nodeInstance.ts's own doc comment). */
  description?: string;
}

export interface UpdateNodeOp {
  op: "update_node";
  nodeId: string;
  properties?: Record<string, unknown>;
  /** Sets NodeInstance.description — see CreateNodeOp.description's own doc comment. */
  description?: string;
}

export interface ConnectOp {
  op: "connect";
  source: { nodeId: string; port: string };
  target: { nodeId: string; port: string };
}

export interface DisconnectOp {
  op: "disconnect";
  connectionId?: string;
  source?: { nodeId: string; port: string };
  target?: { nodeId: string; port: string };
}

export interface DeleteNodeOp {
  op: "delete_node";
  nodeId: string;
  cascade?: boolean;
}

/** A visual annotation the AI can drop around a section of the graph to document intent (e.g. "Send
 * the notification email") — never affects execution, purely organizational (see engine/types.ts's
 * own CommentBox doc comment). `containedNodeIds` only needs to list node ids that should be
 * visually grouped inside the box; it's fine to leave it empty for a free-floating note. */
export interface CreateCommentBoxOp {
  op: "create_comment_box";
  text: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  containedNodeIds?: string[];
  color?: string;
}

export interface DeleteCommentBoxOp {
  op: "delete_comment_box";
  commentBoxId: string;
}

export type ChangeOp = CreateNodeOp | UpdateNodeOp | ConnectOp | DisconnectOp | DeleteNodeOp | CreateCommentBoxOp | DeleteCommentBoxOp;

export interface ChangeResult {
  op: ChangeOp["op"];
  /** The resolved (real, non-temp) node id this op created/affected, if any. */
  nodeId?: string;
  tempId?: string;
  connectionId?: string;
  commentBoxId?: string;
  summary: string;
}

export interface ApplyChangesRequest {
  changes: ChangeOp[];
  dryRun?: boolean;
  /** Optimistic-concurrency guard — see AiGraphApi's own `version` counter. */
  expectedVersion?: number;
}

export interface ApplyChangesResult {
  success: boolean;
  dryRun: boolean;
  transactionId: string;
  version: number;
  errors: ValidationError[];
  changes: ChangeResult[];
  summary: string[];
}

// --- Execution / debugging ------------------------------------------------------------------

export type ExecutionStatus = "running" | "completed" | "error";

export interface RuntimeError {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  port?: string;
  code: string;
  message: string;
  stack?: string;
  timestamp: string;
}

export interface RuntimeNodeState {
  nodeId: string;
  status: "pending" | "ran" | "error";
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  order: number;
  error?: RuntimeError;
}

export interface ExecutionRecord {
  executionId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  logs: string[];
  errors: RuntimeError[];
  nodeStates: Map<string, RuntimeNodeState>;
  trace: string[];
}

export interface RunResult {
  executionId: string;
  status: ExecutionStatus;
  durationMs: number;
  outputs: Record<string, unknown>;
  warnings: string[];
  errors: RuntimeError[];
}

export type OperationCategory = "read" | "safe_mutation" | "destructive_mutation" | "execution";
