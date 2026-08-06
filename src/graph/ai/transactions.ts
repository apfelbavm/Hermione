import { Graph } from "../engine/graph";
import { connectPins } from "../engine/graphMutations";
import { NodeInstance } from "../engine/nodeInstance";
import { getNodeDef } from "../engine/registry";
import { deserializeGraph } from "../persistence/load";
import { serializeGraph } from "../persistence/save";
import { type AiGraphContext, visibleFunctions, visibleScripts, visibleVariables } from "./context";
import { layoutAround, layoutGraph } from "./layoutOperations";
import { connect, createCommentBox, createNode, deleteCommentBox, deleteNode, disconnect, updateNode } from "./mutations";
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

/** Copies one graph's mutable, op-affected state (nodes/connections/etc) onto another in place —
 * used to adopt a validated clone's result without replacing the original Graph object's identity,
 * since callers elsewhere (editor store, undo/redo, tests) keep their own reference to it. */
function adoptGraphState(target: Graph, source: Graph): void {
  target.nodes = source.nodes;
  target.connections = source.connections;
  target.commentBoxes = source.commentBoxes;
  target.variables = source.variables;
  target.scripts = source.scripts;
}

/** Adopts every graph in `clone`'s document (root + each function body, matched by array position
 * — ops never add/remove functions) onto the corresponding original graph in `ctx`, in place. */
function adoptClone(ctx: AiGraphContext, clone: AiGraphContext): void {
  adoptGraphState(ctx.rootGraph, clone.rootGraph);
  ctx.rootGraph.functions.forEach((fn, i) => adoptGraphState(fn.body, clone.rootGraph.functions[i].body));
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
    case "create_comment_box":
      return { ...op, containedNodeIds: op.containedNodeIds?.map(resolve) };
    case "delete_comment_box":
      return op;
  }
}

/** Applies every op in order against `ctx` in place, stopping at the first failure — the whole
 * batch is rejected rather than partially applied (see section 6 of the design). */
function applyOps(ctx: AiGraphContext, changes: ChangeOp[], isFunctionBody: boolean): { results: ChangeResult[]; errors: ValidationError[] } {
  const tempMap = new Map<string, string>();
  const results: ChangeResult[] = [];

  for (const raw of changes) {
    let op: ChangeOp;
    try {
      op = resolveOp(raw, tempMap);
    } catch {
      return { results, errors: [{ code: "INVALID_OPERATION", message: `Malformed ${raw.op} operation — check it has the fields this op type requires (e.g. "connect" needs source: {nodeId, port} and target: {nodeId, port}, not custom field names).` }] };
    }

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
    if (op.op === "create_comment_box") {
      const outcome = createCommentBox(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "create_comment_box", commentBoxId: outcome.commentBoxId, summary: outcome.summary! });
      continue;
    }
    if (op.op === "delete_comment_box") {
      const outcome = deleteCommentBox(ctx, op);
      if (outcome.errors.length > 0) return { results, errors: outcome.errors };
      results.push({ op: "delete_comment_box", commentBoxId: outcome.commentBoxId, summary: outcome.summary! });
      continue;
    }
  }

  return { results, errors: [] };
}

/** Finds the first node (in creation order) among `createdNodeIds` that has an exec input pin
 * with nothing wired into it yet — i.e. a plausible "start of the chain" the AI forgot to hook up
 * to a trigger. Returns its id and exec-in pin id, or undefined if every created node already has
 * something feeding its exec input (or none has an exec input at all, e.g. a pure data node). */
function findUnwiredExecEntryPoint(ctx: AiGraphContext, createdNodeIds: string[]): { nodeId: string; execInPin: string } | undefined {
  const variables = visibleVariables(ctx);
  const functions = visibleFunctions(ctx);
  const scripts = visibleScripts(ctx);
  for (const nodeId of createdNodeIds) {
    const node = ctx.graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const execIn = node.resolvePinDefs(variables, functions, scripts).find((p) => p.direction === "input" && p.type === "exec");
    if (!execIn) continue;
    if (ctx.graph.connections.some((c) => c.toNode === nodeId && c.toPin === execIn.id)) continue;
    return { nodeId, execInPin: execIn.id };
  }
  return undefined;
}

/** Walks a single-output "exec-out" chain starting at `startNodeId`, following each node's
 * outgoing exec-out connection, until it reaches a node whose exec-out has nothing wired after it
 * (the current end of the runnable chain) — or the start node itself, if it has no outgoing exec
 * connection at all. Only follows the pin id "exec-out" specifically, so branching nodes with
 * multiple named exec outputs (e.g. a condition's true/false) are treated as a dead end rather
 * than guessed at. Bounded by `graph.connections.length` hops to stay safe against a malformed
 * cyclic graph. */
function findExecChainTail(ctx: AiGraphContext, startNodeId: string): string {
  let current = startNodeId;
  for (let i = 0; i < ctx.graph.connections.length; i++) {
    const next = ctx.graph.connections.find((c) => c.fromNode === current && c.fromPin === "exec-out");
    if (!next) return current;
    current = next.toNode;
  }
  return current;
}

/** The AI is told to include an event-trigger node itself when building something runnable (see
 * systemPrompt.ts rule 8), but it doesn't always remember to. Rather than let the graph end up
 * stuck with no way to run/test it, auto-add one the moment the AI creates any node into a root
 * graph that doesn't have one yet — never on an untouched/empty graph (only a real create_node in
 * this batch triggers it), and never inside a function body (event triggers can't live there).
 *
 * Also auto-wires any newly-created node whose exec-in is still unconnected (see
 * findUnwiredExecEntryPoint) onto the END of whatever exec chain already exists off the trigger
 * (see findExecChainTail) — not just when this call is the one adding the trigger. A later task in
 * the same conversation (e.g. "now also send an email") typically creates its node(s) into a graph
 * that ALREADY has a trigger (added by an earlier task, or by the AI itself in the very same
 * batch), so gating the wiring on "we just added the trigger" left every later task's node
 * permanently disconnected — the AI reliably forgets this wire even when told to add it, and an
 * unconnected node is just as useless to the user as a missing trigger. Appending to the tail
 * (rather than always rewiring the trigger's own exec-out) avoids silently detaching whatever an
 * earlier task already wired, since an exec-out can only ever drive one next step. */
function autoAddEventTriggerIfMissing(ctx: AiGraphContext, changes: ChangeOp[], isFunctionBody: boolean, results: ChangeResult[]): void {
  if (isFunctionBody) return;
  if (!changes.some((c) => c.op === "create_node")) return;

  let triggerNode = ctx.rootGraph.nodes.find((n) => !!getNodeDef(n.type).eventTrigger);
  if (!triggerNode) {
    const def = getNodeDef("event.simulate");
    const minX = ctx.rootGraph.nodes.length > 0 ? Math.min(...ctx.rootGraph.nodes.map((n) => n.position.x)) : 0;
    const minY = ctx.rootGraph.nodes.length > 0 ? Math.min(...ctx.rootGraph.nodes.map((n) => n.position.y)) : 0;
    triggerNode = NodeInstance.createNodeInstance("event.simulate", { x: minX - 260, y: minY }, def.pins);
    ctx.rootGraph.nodes.push(triggerNode);
    results.push({ op: "create_node", nodeId: triggerNode.id, summary: `Auto-added an event.simulate trigger node (${triggerNode.id}) — this graph had no event-trigger node yet, so it couldn't run.` });
  }

  const createdNodeIds = results.filter((r) => r.op === "create_node" && r.nodeId).map((r) => r.nodeId!);

  // Loop rather than a single connect: one batch can contain several independently-unwired islands
  // (e.g. the AI built both a print node and a send-mail node in the same turn, wiring neither to
  // anything) — each pass appends the next dangling island onto the tail, then the tail moves
  // forward to it, so the whole batch ends up chained one after another instead of only the first
  // island getting rescued. Bounded by createdNodeIds.length since each successful connect removes
  // exactly one candidate from contention (its exec-in is no longer unwired on the next pass).
  for (let i = 0; i < createdNodeIds.length; i++) {
    const entryPoint = findUnwiredExecEntryPoint(ctx, createdNodeIds);
    if (!entryPoint || entryPoint.nodeId === triggerNode.id) return;

    const tailNodeId = findExecChainTail(ctx, triggerNode.id);
    if (tailNodeId === entryPoint.nodeId) return;
    try {
      const connection = connectPins(ctx.graph, visibleVariables(ctx), visibleFunctions(ctx), { fromNode: tailNodeId, fromPin: "exec-out", toNode: entryPoint.nodeId, toPin: entryPoint.execInPin }, visibleScripts(ctx));
      results.push({ op: "connect", connectionId: connection.id, summary: `Auto-connected "${tailNodeId}".exec-out to "${entryPoint.nodeId}".${entryPoint.execInPin} so the new node actually runs.` });
      // layoutUnpositionedCreatedNodes (which already ran, see prepareChanges) had no connection to
      // go on yet when it placed entryPoint, so it only nudged it clear of overlaps — reposition it
      // properly now that the real edge exists, so it lands next to its predecessor in the chain
      // instead of wherever collision-avoidance happened to leave it (e.g. stacked underneath).
      layoutAround(ctx, { anchorNodeId: tailNodeId, nodeIds: [entryPoint.nodeId] });
    } catch {
      // Leave it unwired if wiring somehow fails (e.g. incompatible pin) — never let this best-effort
      // convenience step fail the whole apply_changes batch, and stop trying further islands since
      // findUnwiredExecEntryPoint would just return the same one again.
      return;
    }
  }
}

/** create_node ops without an explicit `position` all fall back to the same (0, 0) default (see
 * mutations.ts's `createNode`), and the AI is only told to follow up with graph.layout/
 * layout_around to spread them out — it frequently forgets, leaving every such node stacked
 * exactly on top of the others (and on top of anything else already sitting at the origin, e.g.
 * a prior batch's auto-added trigger). Matches `changes` against `results` positionally (both are
 * filtered to "create_node" and iterated in the same order, so they line up 1:1 as long as every
 * op in `changes` succeeded, which is guaranteed by the time this runs) to find which newly
 * created nodes never got a real position, then runs the layout engine over just that subset —
 * "selection" scope + "auto" mode preserves the rest of the graph untouched, arranges the new
 * nodes relative to each other via their own connections, and nudges the whole cluster away from
 * any pre-existing node it would otherwise still overlap. */
function layoutUnpositionedCreatedNodes(ctx: AiGraphContext, changes: ChangeOp[], results: ChangeResult[]): void {
  const createdOps = changes.filter((c): c is Extract<ChangeOp, { op: "create_node" }> => c.op === "create_node");
  const createdResults = results.filter((r) => r.op === "create_node");
  const unpositionedIds = createdOps.map((op, i) => (op.position === undefined ? createdResults[i]?.nodeId : undefined)).filter((id): id is string => !!id);

  if (unpositionedIds.length === 0) return;
  layoutGraph(ctx, { scope: "selection", nodeIds: unpositionedIds, mode: "auto" });
}

export interface ApplyChangesOptions {
  isFunctionBody?: boolean;
  currentVersion: number;
}

/** The result of validating a change set against a throwaway clone, before it's either reported
 * back as a dry run or adopted as the real graph state. Exposed so a caller (AiGraphApi) can cache
 * one across a dryRun call and its immediately-following non-dryRun call for the identical change
 * set — see the `reuse` param on `applyChanges` below. */
export interface PreparedChanges {
  clone: AiGraphContext;
  results: ChangeResult[];
}

function prepareChanges(ctx: AiGraphContext, changes: ChangeOp[], isFunctionBody: boolean): { prepared: PreparedChanges | null; errors: ValidationError[] } {
  const clone = cloneContext(ctx);
  const applied = applyOps(clone, changes, isFunctionBody);
  if (applied.errors.length > 0) return { prepared: null, errors: applied.errors };
  layoutUnpositionedCreatedNodes(clone, changes, applied.results);
  autoAddEventTriggerIfMissing(clone, changes, isFunctionBody, applied.results);
  return { prepared: { clone, results: applied.results }, errors: [] };
}

/** graph.apply_changes — validates the entire batch against a throwaway clone first ("Prepare");
 * only once that fully succeeds does it adopt that same clone as the real `ctx` state ("Commit"),
 * unless `dryRun` is set, in which case the real graph is never touched at all. Committing adopts
 * the already-validated clone verbatim rather than re-running the ops a second time against `ctx`
 * — re-running would mint fresh random node ids (see NodeInstance.createNodeInstance) that no
 * longer match whatever a preceding dry run already reported back to the caller. Pass `reuse` (the
 * `PreparedChanges` from an earlier dry run of this exact same request) to commit that dry run's
 * own clone instead of preparing again, keeping ids consistent across the two calls. */
export function applyChanges(ctx: AiGraphContext, request: ApplyChangesRequest, options: ApplyChangesOptions, reuse?: PreparedChanges, onPrepared?: (prepared: PreparedChanges) => void): ApplyChangesResult {
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

  if (!Array.isArray(request.changes)) {
    return {
      success: false,
      dryRun: !!request.dryRun,
      transactionId,
      version: options.currentVersion,
      errors: [{ code: "INVALID_OPERATION", message: 'graph.apply_changes requires a "changes" array field (not "ops" or anything else).' }],
      changes: [],
      summary: [],
    };
  }

  const { prepared, errors } = reuse ? { prepared: reuse, errors: [] as ValidationError[] } : prepareChanges(ctx, request.changes, !!options.isFunctionBody);
  if (!prepared) {
    return { success: false, dryRun: !!request.dryRun, transactionId, version: options.currentVersion, errors, changes: [], summary: [] };
  }
  onPrepared?.(prepared);

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

  adoptClone(ctx, prepared.clone);

  return {
    success: true,
    dryRun: false,
    transactionId,
    version: options.currentVersion + 1,
    errors: [],
    changes: prepared.results,
    summary: prepared.results.map((r) => r.summary),
  };
}
