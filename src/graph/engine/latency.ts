import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef } from "./registry";
import type { FunctionDef } from "./types";

/** Guards against infinite recursion through (mutually) recursive Call Function chains — a
 * function currently being checked is treated as "not latent" if reached again, which just means
 * a self-recursive function's OWN latency is decided by whatever's outside the cycle; an exotic
 * edge case, not worth chasing further. */
type VisitingFunctionIds = ReadonlySet<string>;

/** True if `node` (living in `graph`, part of the graph tree rooted at `rootGraph`) is "latent" —
 * Unreal's term for a node that genuinely spans real time/multiple ticks rather than completing
 * within the current one. True in exactly three cases:
 *   1. Its own NodeDef is unconditionally latent (Delay, Send Email mock, HTTP Request).
 *   2. It's a Call Function node whose target function's body transitively contains a latent node.
 *   3. It's a node with its own re-entrant body pin(s) (NodeDef.latentBodyPins — For Loop/Array,
 *      Set,Map For Each's "loop-body", or Sequence's every "then-N") whose sub-chain(s)
 *      transitively contain a latent node.
 * A node earlier in the same sequence as a latent node is NOT itself latent — same as Unreal,
 * where only the actual latent node (and any function/macro call wrapping one) gets the clock icon. */
export function isNodeLatent(node: NodeInstance, graph: Graph, rootGraph: Graph, visitingFunctionIds: VisitingFunctionIds = new Set()): boolean {
  const def = getNodeDef(node.type);
  if (def.latent) return true;

  if (node.type === "function.call" && node.functionId) {
    if (visitingFunctionIds.has(node.functionId)) return false;
    const fn = rootGraph.functions.find((f) => f.id === node.functionId);
    if (!fn) return false;
    return isFunctionLatent(fn, rootGraph, new Set([...visitingFunctionIds, node.functionId]));
  }

  if (def.latentBodyPins) {
    return isChainLatent(graph, rootGraph, node.id, def.latentBodyPins(node), visitingFunctionIds);
  }

  return false;
}

/** True if any node transitively reachable via exec wires starting at any of (startNodeId,
 * startPinIds) is latent (see isNodeLatent) — used for a node's own body sub-chain(s). Walks EVERY
 * exec-out pin of each node it reaches (not just the starting pin), since a body chain can branch/
 * sequence through several nodes before looping back or ending. */
function isChainLatent(graph: Graph, rootGraph: Graph, startNodeId: string, startPinIds: string[], visitingFunctionIds: VisitingFunctionIds): boolean {
  const variables = rootGraph.getVisibleVariables(graph);
  const visitedNodeIds = new Set<string>();
  const queue: Array<{ nodeId: string; pinId: string }> = startPinIds.map((pinId) => ({ nodeId: startNodeId, pinId }));

  while (queue.length > 0) {
    const { nodeId, pinId } = queue.shift()!;
    for (const conn of graph.connections) {
      if (conn.fromNode !== nodeId || conn.fromPin !== pinId) continue;
      if (visitedNodeIds.has(conn.toNode)) continue;
      visitedNodeIds.add(conn.toNode);

      const nextNode = graph.nodes.find((n) => n.id === conn.toNode);
      if (!nextNode) continue;
      if (isNodeLatent(nextNode, graph, rootGraph, visitingFunctionIds)) return true;

      const execOutPins = nextNode.resolvePinDefs(variables, rootGraph.functions, rootGraph.scripts).filter((p) => p.direction === "output" && p.type === "exec");
      for (const p of execOutPins) {
        queue.push({ nodeId: nextNode.id, pinId: p.id });
      }
    }
  }

  return false;
}

/** True if any node anywhere in `fn`'s body is latent (see isNodeLatent) — a function containing
 * a latent node is itself latent from the caller's perspective, same as Unreal's macros/functions
 * containing a latent node showing the clock icon at every Call site. */
export function isFunctionLatent(fn: FunctionDef, rootGraph: Graph, visitingFunctionIds: VisitingFunctionIds = new Set()): boolean {
  return fn.body.nodes.some((n) => isNodeLatent(n, fn.body, rootGraph, visitingFunctionIds));
}
