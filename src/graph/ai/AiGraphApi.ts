import type { Graph } from "../engine/graph";
import { deserializeGraph } from "../persistence/load";
import { serializeGraph } from "../persistence/save";
import { type AiGraphContext, rootContext } from "./context";
import { getConnections, getNode, getNodes, getSummary, findNodes, type ConnectionFilter, type FindNodesQuery, type NodeFilter } from "./inspection";
import { findNodeTypes, getNodeTypeMetadata, searchNodeTypes, type NodeTypeFilter } from "./metadataAdapter";
import { connect, createNode, deleteNode, disconnect, updateNode } from "./mutations";
import { getRuntimeErrors, getRuntimeState, runGraph, traceExecution, type RunOptions } from "./execution";
import { applyChanges, findGraphById } from "./transactions";
import { validateGraph } from "./validation";
import type { ApplyChangesRequest, ApplyChangesResult, ChangeOp, GraphSummary, RunResult, ValidationResult } from "./types";

export interface AiGraphApiOptions {
  /** True when this API instance is scoped to editing a function's body rather than the root
   * graph — mirrors AppState.activeFunctionId (see state/store.ts's getEditingGraph). */
  isFunctionBody?: boolean;
}

/** The AI-facing facade over one open graph (see section 3 of the design) — every AI tool call
 * ultimately goes through one of this class's methods, never the raw Graph/NodeInstance API
 * directly. Owns its own optimistic-concurrency version counter and undo/redo/snapshot stacks;
 * the underlying Graph/NodeInstance/registry/executor remain the actual source of truth and are
 * never duplicated, only wrapped. */
export class AiGraphApi {
  private ctx: AiGraphContext;
  private isFunctionBody: boolean;
  private currentVersion = 0;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private snapshots = new Map<string, { label?: string; createdAt: string; json: string }>();
  private selectedNodeIds: string[] = [];

  constructor(rootGraph: Graph, options: AiGraphApiOptions = {}) {
    this.ctx = rootContext(rootGraph);
    this.isFunctionBody = !!options.isFunctionBody;
  }

  get rootGraph(): Graph {
    return this.ctx.rootGraph;
  }

  /** Re-points this API at a root graph object that changed identity out from under it — e.g. the
   * editor finished loading a Flow, an undo/redo/version-restore happened, or the user switched
   * flows — all of which replace `store.state.rootGraph` wholesale rather than mutating it in
   * place. Without this, this instance would keep mutating its own stale captured graph and then
   * overwrite the real (newer) one with it (see AiChatPanel's syncGraphIntoStore). Call before
   * dispatching any tool call whenever `store.state.rootGraph !== api.rootGraph`. */
  adoptRootGraph(rootGraph: Graph): void {
    this.ctx = rootContext(rootGraph);
    this.undoStack = [];
    this.redoStack = [];
  }

  get version(): number {
    return this.currentVersion;
  }

  setSelection(nodeIds: string[]): void {
    this.selectedNodeIds = nodeIds;
  }

  private restoreFromJson(json: string): void {
    const graphId = this.ctx.graph.id;
    this.ctx.rootGraph = deserializeGraph(json);
    this.ctx.graph = findGraphById(this.ctx.rootGraph, graphId) ?? this.ctx.rootGraph;
  }

  // --- Inspection --------------------------------------------------------------------------

  getSummary(): GraphSummary {
    return getSummary(this.ctx, { selectedNodeIds: this.selectedNodeIds, version: this.currentVersion });
  }

  getNodes(filter: NodeFilter = {}) {
    return getNodes(this.ctx, filter);
  }

  getNode(nodeId: string) {
    return getNode(this.ctx, nodeId);
  }

  findNodes(query: FindNodesQuery = {}) {
    return findNodes(this.ctx, query);
  }

  getConnections(filter: ConnectionFilter = {}) {
    return getConnections(this.ctx, filter);
  }

  getNodeTypes(filter: NodeTypeFilter = {}) {
    return findNodeTypes(filter);
  }

  getNodeType(type: string) {
    return getNodeTypeMetadata(type);
  }

  searchNodeTypes(query: string, limit?: number) {
    return searchNodeTypes(query, limit);
  }

  validate(): ValidationResult {
    return validateGraph(this.ctx);
  }

  // --- Single-operation mutation convenience wrappers --------------------------------------
  // Each is just a one-op graph.apply_changes call so every mutation — single or batched — goes
  // through the exact same validated/transactional/versioned path (see applyChanges below).

  createNode(op: Omit<Extract<ChangeOp, { op: "create_node" }>, "op">): ApplyChangesResult {
    return this.applyChanges({ changes: [{ op: "create_node", ...op }] });
  }

  updateNode(op: Omit<Extract<ChangeOp, { op: "update_node" }>, "op">): ApplyChangesResult {
    return this.applyChanges({ changes: [{ op: "update_node", ...op }] });
  }

  connect(op: Omit<Extract<ChangeOp, { op: "connect" }>, "op">): ApplyChangesResult {
    return this.applyChanges({ changes: [{ op: "connect", ...op }] });
  }

  disconnect(op: Omit<Extract<ChangeOp, { op: "disconnect" }>, "op">): ApplyChangesResult {
    return this.applyChanges({ changes: [{ op: "disconnect", ...op }] });
  }

  deleteNode(op: Omit<Extract<ChangeOp, { op: "delete_node" }>, "op">): ApplyChangesResult {
    return this.applyChanges({ changes: [{ op: "delete_node", ...op }] });
  }

  // --- Transaction API ----------------------------------------------------------------------

  applyChanges(request: ApplyChangesRequest): ApplyChangesResult {
    if (request.dryRun) {
      return applyChanges(this.ctx, request, { isFunctionBody: this.isFunctionBody, currentVersion: this.currentVersion });
    }

    const before = serializeGraph(this.ctx.rootGraph);
    const result = applyChanges(this.ctx, request, { isFunctionBody: this.isFunctionBody, currentVersion: this.currentVersion });
    if (result.success) {
      this.undoStack.push(before);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
      this.currentVersion = result.version;
    }
    return result;
  }

  // --- History -------------------------------------------------------------------------------

  undo(): { success: boolean; message: string } {
    if (this.undoStack.length === 0) return { success: false, message: "Nothing to undo" };
    const current = serializeGraph(this.ctx.rootGraph);
    const previous = this.undoStack.pop()!;
    this.redoStack.push(current);
    this.restoreFromJson(previous);
    this.currentVersion++;
    return { success: true, message: "Undid last AI change" };
  }

  redo(): { success: boolean; message: string } {
    if (this.redoStack.length === 0) return { success: false, message: "Nothing to redo" };
    const current = serializeGraph(this.ctx.rootGraph);
    const next = this.redoStack.pop()!;
    this.undoStack.push(current);
    this.restoreFromJson(next);
    this.currentVersion++;
    return { success: true, message: "Redid last AI change" };
  }

  // --- Snapshots -----------------------------------------------------------------------------

  createSnapshot(label?: string): { snapshotId: string; createdAt: string } {
    const snapshotId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.snapshots.set(snapshotId, { label, createdAt, json: serializeGraph(this.ctx.rootGraph) });
    return { snapshotId, createdAt };
  }

  restoreSnapshot(snapshotId: string): { success: boolean; message: string } {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return { success: false, message: `Snapshot "${snapshotId}" not found` };
    this.undoStack.push(serializeGraph(this.ctx.rootGraph));
    this.redoStack = [];
    this.restoreFromJson(snapshot.json);
    this.currentVersion++;
    return { success: true, message: `Restored snapshot "${snapshotId}"` };
  }

  // --- Execution / debugging -------------------------------------------------------------------

  run(options: RunOptions = {}): Promise<RunResult> {
    return runGraph(this.ctx, options);
  }

  getRuntimeErrors(executionId?: string) {
    return getRuntimeErrors(executionId);
  }

  getRuntimeState(nodeId: string, executionId?: string) {
    return getRuntimeState(nodeId, executionId);
  }

  traceExecution(executionId: string) {
    return traceExecution(executionId);
  }
}
