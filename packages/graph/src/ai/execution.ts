import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { tryGetNodeDef } from "@hermione/graph/engine/registry";
import type { AiGraphContext } from "./context";
import type { ExecutionRecord, RunResult, RuntimeError, RuntimeNodeState } from "./types";

/** In-memory log of every graph.run this process has performed, keyed by executionId — read back
 * by graph.get_runtime_errors/get_runtime_state/trace_execution. Process-local only (mirrors how
 * /api/simulate's own run state is transient); a real deployment could swap this for the existing
 * RunLog persistence (see server/DatabaseManager.ts) without changing the AiGraphApi surface. */
const executionRecords = new Map<string, ExecutionRecord>();

export interface RunOptions {
  /** Restricts which event-trigger node(s) to run from — by eventTrigger kind (e.g. "manual"),
   * by explicit node id, or both. Runs every event-trigger node in the graph when omitted. */
  eventKind?: string;
  nodeIds?: string[];
}

export async function runGraph(ctx: AiGraphContext, options: RunOptions = {}): Promise<RunResult> {
  const executionId = crypto.randomUUID();
  const startTime = Date.now();

  const record: ExecutionRecord = { executionId, status: "running", startedAt: new Date().toISOString(), logs: [], errors: [], nodeStates: new Map(), trace: [] };
  executionRecords.set(executionId, record);

  let order = 0;
  let currentNodeId: string | undefined;
  const warnings: string[] = [];

  const execCtx = createExecutionContext(ctx.graph, {
    log: (message) => record.logs.push(message),
    onNodeStart: (nodeId) => {
      currentNodeId = nodeId;
      record.trace.push(nodeId);
      const state: RuntimeNodeState = { nodeId, status: "ran", inputs: {}, outputs: {}, order: order++ };
      record.nodeStates.set(nodeId, state);
    },
    onPinValues: (nodeId, values) => {
      const state = record.nodeStates.get(nodeId);
      if (state) state.outputs = { ...state.outputs, ...values };
    },
  });

  const allEventNodes = ctx.graph.nodes.filter((n) => !!tryGetNodeDef(n.type)?.eventTrigger);
  const eventRoots = allEventNodes.filter((n) => {
    const def = tryGetNodeDef(n.type)!;
    if (options.eventKind && def.eventTrigger!.kind !== options.eventKind) return false;
    if (options.nodeIds && !options.nodeIds.includes(n.id)) return false;
    return true;
  });

  if (eventRoots.length === 0) {
    // Distinguish "graph genuinely has no event-trigger node" from "one exists but eventKind/
    // nodeIds filtered it out" (e.g. a stray tempId instead of the real nodeId create_node
    // returned) — the latter looks identical from the caller's side otherwise.
    if (allEventNodes.length === 0) warnings.push("No matching event-trigger node found in the graph — nothing was run.");
    else warnings.push(`No event-trigger node matched eventKind=${options.eventKind ?? "(any)"}/nodeIds=${options.nodeIds?.join(",") ?? "(any)"}. Real event-trigger nodes present: ${allEventNodes.map((n) => `${n.id} (${n.type})`).join(", ")}.`);
  }

  try {
    for (const root of eventRoots) {
      await runExecFrom(root.id, "exec-out", execCtx);
    }
    record.status = "completed";
  } catch (err) {
    record.status = "error";
    const message = err instanceof Error ? err.message : String(err);
    const nodeId = currentNodeId ?? "unknown";
    const nodeType = ctx.graph.nodes.find((n) => n.id === nodeId)?.type ?? "unknown";
    const runtimeError: RuntimeError = { id: crypto.randomUUID(), executionId, nodeId, nodeType, code: "EXECUTION_ERROR", message, stack: err instanceof Error ? err.stack : undefined, timestamp: new Date().toISOString() };
    record.errors.push(runtimeError);
    const state = record.nodeStates.get(nodeId);
    if (state) {
      state.status = "error";
      state.error = runtimeError;
    }
  }

  record.finishedAt = new Date().toISOString();
  record.durationMs = Date.now() - startTime;

  const outputs: Record<string, unknown> = {};
  for (const state of record.nodeStates.values()) {
    for (const [pinId, value] of Object.entries(state.outputs)) outputs[`${state.nodeId}:${pinId}`] = value;
  }

  return { executionId, status: record.status, durationMs: record.durationMs, outputs, warnings, errors: record.errors };
}

export function getExecutionRecord(executionId: string): ExecutionRecord | undefined {
  return executionRecords.get(executionId);
}

export function getRuntimeErrors(executionId?: string): RuntimeError[] {
  if (executionId) return executionRecords.get(executionId)?.errors ?? [];
  return [...executionRecords.values()].flatMap((r) => r.errors);
}

export function getRuntimeState(nodeId: string, executionId?: string): RuntimeNodeState | undefined {
  if (executionId) return executionRecords.get(executionId)?.nodeStates.get(nodeId);
  // Most-recent execution touching this node, newest first.
  const records = [...executionRecords.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const record of records) {
    const state = record.nodeStates.get(nodeId);
    if (state) return state;
  }
  return undefined;
}

/** Renders the ordered node-visit trace (see ExecutionRecord.trace) as "A -> B -> C -> ERROR"
 * style lines the AI can reason over directly, per section 10 of the design. */
export function traceExecution(executionId: string): string[] {
  const record = executionRecords.get(executionId);
  if (!record) return [];
  const lines = [...record.trace];
  if (record.status === "error") lines.push("ERROR");
  return lines;
}

export function clearExecutionRecords(): void {
  executionRecords.clear();
}
