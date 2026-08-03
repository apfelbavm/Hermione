import { Graph } from "../engine/graph";
import { deserializeGraph } from "../persistence/load";
import { serializeGraph } from "../persistence/save";
import { type AiGraphContext } from "./context";
import { connect, createNode, deleteNode, disconnect, updateNode } from "./mutations";
import type { ApplyChangesRequest, ApplyChangesResult, ChangeOp, ChangeResult, ValidationError } from "./types";

export function findGraphById(rootGraph: Graph, id: string): Graph | undefined {
  if (rootGraph.id === id) return rootGraph;
  return rootGraph.functions.find((f) => f.body.id === id)?.body;
}

/** Deep-clones the whole document `ctx` belongs to (root graph + every function body) via the
 * same JSON round-trip persistence already uses (see persistence/save.ts, load.ts) — reused here
 * instead of a bespoke structuredClone so a cloned NodeInstance/Graph keeps its real prototype
 * (resolvePinDefs, etc.), exactly like a freshly-loaded document. */
function cloneContext(ctx: AiGraphContext): AiGraphContext {
  const clonedRoot = deserializeGraph(serializeGraph(ctx.rootGraph));
  const clonedGraph = findGraphById(clonedRoot, ctx.graph.id) ?? clonedRoot;
  return { rootGraph: clonedRoot, graph: clonedGraph };
}

/** Resolves any node/temp-id-shaped field in `op` through `tempMap` (real ids pass through
 * unchanged) so a later op in the same change set can refer to a node created earlier in it. */
function resolveOp(op: ChangeOp, tempMap: Map<string, string>): ChangeOp {
  const resolve = (id: string) => tempMap.get(id) ?? id;
  switch (op.op) {
    case "create_node":
      return op;
    case "update_node":
      return { ...op, nodeId: resolve(op.nodeId) };
    case "connect":
      return { ...op, source: { ...op.source, nodeId: resolve(op.source.nodeId) }, target: { ...op.target, nodeId: resolve(op.target.nodeId) } };
    case "disconnect":
      return {
        ...op,
        source: op.source ? { ...op.source, nodeId: resolve(op.source.nodeId) } : undefined,
        target: op.target ? { ...op.target, nodeId: resolve(op.target.nodeId) } : undefined,
      };
    case "delete_node":
      return { ...op, nodeId: resolve(op.nodeId) };
  }
}

/** Applies every op in order against `ctx` in place, stopping at the first failure — the whole
 * batch is rejected rather than partially applied (see section 6 of the design). */
function applyOps(ctx: AiGraphContext, changes: ChangeOp[], isFunctionBody: boolean): { results: ChangeResult[]; errors: ValidationError[] } {
  const tempMap = new Map<string, string>();
  const results: ChangeResult[] = [];

  for (const raw of changes) {
    const op = resolveOp(raw, tempMap);

    if (op.op === "create_node") {
      const outcome = createNode(ctx, op, isFunctionBody);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      if (op.tempId && outcome.nodeId) tempMap.set(op.tempId, outcome.nodeId);
      results.push({ op: "create_node", nodeId: outcome.nodeId, tempId: op.tempId, summary: outcome.summary! });
      continue;
    }
    if (op.op === "update_node") {
      const outcome = updateNode(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "update_node", nodeId: outcome.nodeId, summary: outcome.summary! });
      continue;
    }
    if (op.op === "connect") {
      const outcome = connect(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "connect", connectionId: outcome.connectionId, summary: outcome.summary! });
      continue;
    }
    if (op.op === "disconnect") {
      const outcome = disconnect(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "disconnect", connectionId: outcome.connectionId, summary: outcome.summary! });
      continue;
    }
    if (op.op === "delete_node") {
      const outcome = deleteNode(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "delete_node", nodeId: outcome.nodeId, summary: outcome.summary! });
      continue;
    }
  }

  return { results, errors: [] };
}

export interface ApplyChangesOptions {
  isFunctionBody?: boolean;
  currentVersion: number;
}

/** graph.apply_changes — validates the entire batch against a throwaway clone first (Phase 1,
 * "Prepare"); only once that fully succeeds does it replay the identical ops against the real
 * `ctx` in place (Phase 2, "Commit"), unless `dryRun` is set, in which case the real graph is
 * never touched at all. A commit-phase failure (should be unreachable, since the clone just
 * proved the same ops succeed) restores `ctx.graph`/`ctx.rootGraph` from a pre-commit snapshot. */
export function applyChanges(ctx: AiGraphContext, request: ApplyChangesRequest, options: ApplyChangesOptions): ApplyChangesResult {
  const transactionId = crypto.randomUUID();

  if (request.expectedVersion !== undefined && request.expectedVersion !== options.currentVersion) {
    return {
      success: false,
      dryRun: !!request.dryRun,
      transactionId,
      version: options.currentVersion,
      errors: [{ code: "VERSION_CONFLICT", message: `Graph has moved on to version ${options.currentVersion} (expected ${request.expectedVersion}) — re-inspect the graph before retrying` }],
      changes: [],
      summary: [],
    };
  }

  const clone = cloneContext(ctx);
  const prepared = applyOps(clone, request.changes, !!options.isFunctionBody);
  if (prepared.errors.length > 0) {
    return { success: false, dryRun: !!request.dryRun, transactionId, version: options.currentVersion, errors: prepared.errors, changes: [], summary: [] };
  }

  if (request.dryRun) {
    return {
      success: true,
      dryRun: true,
      transactionId,
      version: options.currentVersion,
      errors: [],
      changes: prepared.results,
      summary: prepared.results.map((r) => r.summary),
    };
  }

  const preCommitSnapshot = serializeGraph(ctx.rootGraph);
  try {
    const committed = applyOps(ctx, request.changes, !!options.isFunctionBody);
    if (committed.errors.length > 0) {
      // Unreachable in practice (the clone already proved these ops succeed) — restore defensively.
      const graphId = ctx.graph.id;
      ctx.rootGraph = deserializeGraph(preCommitSnapshot);
      ctx.graph = findGraphById(ctx.rootGraph, graphId) ?? ctx.rootGraph;
      return { success: false, dryRun: false, transactionId, version: options.currentVersion, errors: committed.errors, changes: [], summary: [] };
    }
    return {
      success: true,
      dryRun: false,
      transactionId,
      version: options.currentVersion + 1,
      errors: [],
      changes: committed.results,
      summary: committed.results.map((r) => r.summary),
    };
  } catch (err) {
    const graphId = ctx.graph.id;
    ctx.rootGraph = deserializeGraph(preCommitSnapshot);
    ctx.graph = findGraphById(ctx.rootGraph, graphId) ?? ctx.rootGraph;
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, dryRun: false, transactionId, version: options.currentVersion, errors: [{ code: "INVALID_OPERATION", message: `Transaction rolled back: ${message}` }], changes: [], summary: [] };
  }
}
