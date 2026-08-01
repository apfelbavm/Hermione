import { Graph } from "./graph";
import { addFunctionInput, addFunctionOutput, connectPins, createFunctionDef, defaultValueFor, nextId } from "./graphMutations";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef } from "./registry";
import type { CodeScriptDef, Connection, FunctionDef, PinSignatureEntry, Variable } from "./types";

/** Where a newly-placed function body puts its Call node's own collapsed cluster, clear of the
 * auto-placed Entry ((40,120))/Return ((360,120)) pair (see createFunctionDef). */
const COLLAPSED_BODY_OFFSET = { x: 500, y: 120 };

interface SelectionBoundary {
  /** Exec connections entering the selection from outside — 0 or more, but (once legal) all
   * targeting the same internal node, since a function has only one Entry exec-out to route. */
  incomingExec: Connection[];
  /** Exec connections leaving the selection to outside — 0 or 1 once legal. */
  outgoingExec: Connection[];
  /** Non-exec connections entering the selection from outside. */
  incomingData: Connection[];
  /** Non-exec connections leaving the selection to outside. */
  outgoingData: Connection[];
}

/** Splits every connection touching the selection's boundary (exactly one endpoint inside) into
 * the four categories collapse/legality both need. Connections with both ends inside (internal)
 * or both ends outside (irrelevant) are skipped — the caller collects internal connections itself,
 * since collapse needs the full Connection objects verbatim (they move into the body as-is). */
function classifyBoundary(graph: Graph, selectedNodeIds: ReadonlySet<string>, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[]): SelectionBoundary {
  const boundary: SelectionBoundary = {
    incomingExec: [],
    outgoingExec: [],
    incomingData: [],
    outgoingData: [],
  };

  for (const c of graph.connections) {
    const fromIn = selectedNodeIds.has(c.fromNode);
    const toIn = selectedNodeIds.has(c.toNode);
    if (fromIn === toIn) continue; // internal or irrelevant

    const fromNode = graph.nodes.find((n) => n.id === c.fromNode);
    const fromPinDef = fromNode?.resolvePinDefs(variables, functions, scripts).find((p) => p.id === c.fromPin);
    const isExec = fromPinDef?.type === "exec";

    if (fromIn) {
      (isExec ? boundary.outgoingExec : boundary.outgoingData).push(c);
    } else {
      (isExec ? boundary.incomingExec : boundary.incomingData).push(c);
    }
  }

  return boundary;
}

/** True if every selected node is reachable from every other one through connections that run
 * strictly between two selected nodes — a lone selected node is trivially "connected". */
function isSelectionConnected(graph: Graph, selectedNodeIds: ReadonlySet<string>): boolean {
  if (selectedNodeIds.size <= 1) return true;

  const adjacency = new Map<string, Set<string>>();
  for (const id of selectedNodeIds) adjacency.set(id, new Set());
  for (const c of graph.connections) {
    if (selectedNodeIds.has(c.fromNode) && selectedNodeIds.has(c.toNode) && c.fromNode !== c.toNode) {
      adjacency.get(c.fromNode)!.add(c.toNode);
      adjacency.get(c.toNode)!.add(c.fromNode);
    }
  }

  const [start] = selectedNodeIds;
  const visited = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    for (const neighbor of adjacency.get(stack.pop()!) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
  }
  return visited.size === selectedNodeIds.size;
}

/** True if the canvas's right-click "Collapse to Function" should be clickable (vs. greyed out)
 * for the current selection:
 *  - every selected node must actually exist in `graph`, be a plain (non-structural, non-event)
 *    node, and — if `graph` is itself a function body — not be bound to a variable LOCAL to that
 *    body (a sibling function's body can't see it, see Graph.getVisibleVariables);
 *  - the selection must form one connected cluster (via any wire, exec or data);
 *  - at most one exec wire may leave the selection (else there's no single continuation point for
 *    the Call node's own exec-out to resume at);
 *  - every exec wire entering the selection must target the same node (else there's no single
 *    entry point for the function's one Entry exec-out to drive). */
export function canCollapseSelectionToFunction(rootGraph: Graph, graph: Graph, selectedNodeIds: ReadonlySet<string>, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): boolean {
  if (selectedNodeIds.size === 0) return false;

  for (const id of selectedNodeIds) {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return false;
    if (Graph.UNDELETABLE_NODE_TYPES.has(node.type)) return false;
    if (getNodeDef(node.type).eventTrigger) return false;

    if (node.variableId && graph !== rootGraph) {
      const isLocal = graph.variables.some((v) => v.id === node.variableId);
      const isGlobal = rootGraph.variables.some((v) => v.id === node.variableId);
      if (isLocal && !isGlobal) return false;
    }
  }

  if (!isSelectionConnected(graph, selectedNodeIds)) return false;

  const { incomingExec, outgoingExec, outgoingData } = classifyBoundary(graph, selectedNodeIds, variables, functions, scripts);
  if (outgoingExec.length > 1) return false;
  if (new Set(incomingExec.map((c) => c.toNode)).size > 1) return false;

  // A function.call node only ever runs its body (and so only ever populates its own output pins)
  // when something fires its exec-in — unlike a plain pure node, which resolveDataPin evaluates on
  // demand regardless of the exec chain. A selection with no exec touching its boundary at all but
  // at least one data wire LEAVING it would collapse into a Call node nothing ever triggers, so
  // whatever used to read that value on demand would instead hit resolveDataPin's "hasn't executed
  // yet" error the first time it's pulled. A selection with no outgoing data (nothing reads its
  // result) is still harmless to collapse this way, same as it being dead code already was.
  if (outgoingData.length > 0 && incomingExec.length === 0 && outgoingExec.length === 0) return false;

  return true;
}

/** The first "{desired}"/"{desired} 2"/"{desired} 3"/... not already in `used` — `used` is
 * mutated to include whatever's returned, so successive calls against the same set dedupe against
 * each other too. Mirrors clipboard.ts's uniqueVariableName for the same reason (never silently
 * collide two new entries), just generalized past variable names. */
function uniqueSignatureName(used: Set<string>, desired: string): string {
  const base = desired || "Value";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) candidate = `${base} ${i++}`;
  used.add(candidate);
  return candidate;
}

export interface CollapseToFunctionResult {
  fn: FunctionDef;
  callNodeId: string;
}

/** Extracts the selection out of `graph` into a brand-new function, replacing it in place with one
 * `function.call` node — the engine counterpart of the canvas's "Collapse to Function." Assumes
 * `canCollapseSelectionToFunction` has already been checked; behavior is undefined otherwise.
 *
 * The new function's signature is derived entirely from wires that crossed the selection's
 * boundary: each surviving exec wire becomes the Call node's own exec-in/exec-out, and each data
 * wire becomes one input/output — named after the pin it was connected to (deduped), and merged
 * into a single pin when several boundary wires shared the same external endpoint (a fan-out
 * source feeding several internal targets, or an internal source feeding several external
 * targets) so the signature never grows an argument per wire when one per VALUE would do. */
export function collapseSelectionToFunction(rootGraph: Graph, graph: Graph, selectedNodeIds: ReadonlySet<string>, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[], name: string): CollapseToFunctionResult {
  const selectedNodes = graph.nodes.filter((n) => selectedNodeIds.has(n.id));
  const internalConnections = graph.connections.filter((c) => selectedNodeIds.has(c.fromNode) && selectedNodeIds.has(c.toNode));
  const { incomingExec, outgoingExec, incomingData, outgoingData } = classifyBoundary(graph, selectedNodeIds, variables, functions, scripts);

  const fn = createFunctionDef(name);
  rootGraph.functions.push(fn); // must happen before any resolvePinDefs/connectPins touching fn's nodes
  const bodyVariables = rootGraph.getVisibleVariables(fn.body);
  const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
  const returnNode = fn.body.nodes.find((n) => n.type === "function.return")!;

  // Move the selection (repositioned clear of Entry/Return) and its internal wiring into the body.
  const minX = Math.min(...selectedNodes.map((n) => n.position.x));
  const minY = Math.min(...selectedNodes.map((n) => n.position.y));
  const offset = {
    x: COLLAPSED_BODY_OFFSET.x - minX,
    y: COLLAPSED_BODY_OFFSET.y - minY,
  };
  for (const node of selectedNodes) {
    node.position = {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y,
    };
  }
  fn.body.nodes.push(...selectedNodes);
  fn.body.connections.push(...internalConnections);

  graph.nodes = graph.nodes.filter((n) => !selectedNodeIds.has(n.id));
  for (const box of graph.commentBoxes) {
    box.containedNodeIds = box.containedNodeIds.filter((id) => !selectedNodeIds.has(id));
  }
  const consumedConnectionIds = new Set([...internalConnections, ...incomingExec, ...outgoingExec, ...incomingData, ...outgoingData].map((c) => c.id));
  graph.connections = graph.connections.filter((c) => !consumedConnectionIds.has(c.id));

  // --- Data pins crossing the boundary become the function's own inputs/outputs -----------------
  const usedInputNames = new Set<string>();
  const usedOutputNames = new Set<string>();
  /** Keyed by the new PinSignatureEntry's id. */
  const inputSources = new Map<string, { fromNode: string; fromPin: string }>();
  const outputTargets = new Map<string, { toNode: string; toPin: string }[]>();

  function groupByExternalEndpoint(conns: Connection[], endpoint: (c: Connection) => string): Connection[][] {
    const groups = new Map<string, Connection[]>();
    for (const c of conns) {
      const key = endpoint(c);
      const group = groups.get(key);
      if (group) group.push(c);
      else groups.set(key, [c]);
    }
    return [...groups.values()];
  }

  for (const group of groupByExternalEndpoint(incomingData, (c) => `${c.fromNode}:${c.fromPin}`)) {
    const first = group[0];
    const targetNode = fn.body.nodes.find((n) => n.id === first.toNode)!;
    const targetPinDef = targetNode.resolvePinDefs(bodyVariables, rootGraph.functions, scripts).find((p) => p.id === first.toPin)!;

    const entry: PinSignatureEntry = {
      id: nextId("io"),
      name: uniqueSignatureName(usedInputNames, targetPinDef.label),
      type: targetPinDef.type,
      defaultValue: targetPinDef.defaultValue ?? defaultValueFor(targetPinDef.type, targetPinDef.container, targetPinDef.subType),
      container: targetPinDef.container,
      keyType: targetPinDef.keyType,
      subType: targetPinDef.subType,
    };
    addFunctionInput(fn, entry);
    inputSources.set(entry.id, {
      fromNode: first.fromNode,
      fromPin: first.fromPin,
    });

    for (const c of group) {
      connectPins(
        fn.body,
        bodyVariables,
        rootGraph.functions,
        {
          fromNode: entryNode.id,
          fromPin: entry.id,
          toNode: c.toNode,
          toPin: c.toPin,
        },
        scripts,
      );
    }
  }

  for (const group of groupByExternalEndpoint(outgoingData, (c) => `${c.fromNode}:${c.fromPin}`)) {
    const first = group[0];
    const sourceNode = fn.body.nodes.find((n) => n.id === first.fromNode)!;
    const sourcePinDef = sourceNode.resolvePinDefs(bodyVariables, rootGraph.functions, scripts).find((p) => p.id === first.fromPin)!;

    const entry: PinSignatureEntry = {
      id: nextId("io"),
      name: uniqueSignatureName(usedOutputNames, sourcePinDef.label),
      type: sourcePinDef.type,
      defaultValue: defaultValueFor(sourcePinDef.type, sourcePinDef.container, sourcePinDef.subType),
      container: sourcePinDef.container,
      keyType: sourcePinDef.keyType,
      subType: sourcePinDef.subType,
    };
    addFunctionOutput(fn, entry);
    outputTargets.set(
      entry.id,
      group.map((c) => ({ toNode: c.toNode, toPin: c.toPin })),
    );

    connectPins(
      fn.body,
      bodyVariables,
      rootGraph.functions,
      {
        fromNode: first.fromNode,
        fromPin: first.fromPin,
        toNode: returnNode.id,
        toPin: entry.id,
      },
      scripts,
    );
  }

  // --- Exec wiring: internal side (Entry -> single entry target, single exit source -> Return) --
  if (incomingExec.length > 0) {
    const target = incomingExec[0];
    connectPins(
      fn.body,
      bodyVariables,
      rootGraph.functions,
      {
        fromNode: entryNode.id,
        fromPin: "exec-out",
        toNode: target.toNode,
        toPin: target.toPin,
      },
      scripts,
    );
  }
  if (outgoingExec.length > 0) {
    const source = outgoingExec[0];
    connectPins(
      fn.body,
      bodyVariables,
      rootGraph.functions,
      {
        fromNode: source.fromNode,
        fromPin: source.fromPin,
        toNode: returnNode.id,
        toPin: "exec-in",
      },
      scripts,
    );
  }

  // --- Replace the selection with a Call node, wired exactly like the boundary it took over ------
  const callDef = getNodeDef("function.call");
  const callPinDefs = callDef.deriveFunctionPins!(fn);
  const callNode = NodeInstance.createNodeInstance("function.call", { x: minX, y: minY }, callPinDefs, undefined, undefined, fn.id);
  graph.addNode(callNode);

  for (const c of incomingExec) {
    connectPins(
      graph,
      variables,
      rootGraph.functions,
      {
        fromNode: c.fromNode,
        fromPin: c.fromPin,
        toNode: callNode.id,
        toPin: "exec-in",
      },
      scripts,
    );
  }
  if (outgoingExec.length > 0) {
    const c = outgoingExec[0];
    connectPins(
      graph,
      variables,
      rootGraph.functions,
      {
        fromNode: callNode.id,
        fromPin: "exec-out",
        toNode: c.toNode,
        toPin: c.toPin,
      },
      scripts,
    );
  }
  for (const [entryId, source] of inputSources) {
    connectPins(
      graph,
      variables,
      rootGraph.functions,
      {
        fromNode: source.fromNode,
        fromPin: source.fromPin,
        toNode: callNode.id,
        toPin: entryId,
      },
      scripts,
    );
  }
  for (const [entryId, targets] of outputTargets) {
    for (const t of targets) {
      connectPins(
        graph,
        variables,
        rootGraph.functions,
        {
          fromNode: callNode.id,
          fromPin: entryId,
          toNode: t.toNode,
          toPin: t.toPin,
        },
        scripts,
      );
    }
  }

  return { fn, callNodeId: callNode.id };
}
