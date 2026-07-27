import { resolvePinDefs } from "./graphMutations";
import { getNodeDef } from "./registry";
import type { ExecutionContext, Graph, NodeInstance } from "./types";

export function findNode(graph: Graph, nodeId: string): NodeInstance {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found in graph`);
  return node;
}

function connectionsFrom(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.filter((c) => c.fromNode === nodeId && c.fromPin === pinId);
}

function connectionTo(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
}

export function createExecutionContext(
  graph: Graph,
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  const variableValues = new Map<string, unknown>();
  for (const variable of graph.variables) {
    variableValues.set(variable.id, variable.defaultValue);
  }
  return {
    log: (message: string) => console.log(message),
    ...overrides,
    graph,
    tickCache: new Map(),
    variableValues,
  };
}

/** Resolves a data-input pin's value: literal, or recursively pulled from an upstream pure node. */
export async function resolveDataPin(
  nodeId: string,
  pinId: string,
  ctx: ExecutionContext,
  resolving: Set<string> = new Set(),
): Promise<unknown> {
  const node = findNode(ctx.graph, nodeId);
  const pin = node.pins[pinId];
  const conn = connectionTo(ctx.graph, nodeId, pinId);

  if (!conn) {
    return pin?.value;
  }

  // Cache/dedup key is the upstream OUTPUT pin, not the requesting input pin —
  // this is what makes a diamond-shaped data dependency evaluate only once per tick,
  // regardless of how many downstream input pins pull from the same output.
  const outputCacheKey = `${conn.fromNode}:${conn.fromPin}`;
  if (ctx.tickCache.has(outputCacheKey)) return ctx.tickCache.get(outputCacheKey);

  if (resolving.has(outputCacheKey)) {
    throw new Error(`Cyclic data-pin dependency detected at ${outputCacheKey}`);
  }
  resolving.add(outputCacheKey);

  const upstreamNode = findNode(ctx.graph, conn.fromNode);
  const upstreamDef = getNodeDef(upstreamNode.type);
  if (!upstreamDef.evaluate) {
    throw new Error(
      `Node "${upstreamNode.type}" (${upstreamNode.id}) has no evaluate() but is wired to a data pin`,
    );
  }
  // Pins actually in effect for this instance — not the static def.pins, which is empty
  // for variable-derived node types (Get/Set Variable) whose pins depend on the bound Variable.
  const upstreamPinDefs = resolvePinDefs(upstreamNode, ctx.graph.variables);

  const upstreamInputs: Record<string, unknown> = {};
  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      upstreamInputs[pinDef.id] = await resolveDataPin(
        upstreamNode.id,
        pinDef.id,
        ctx,
        resolving,
      );
    }
  }

  const outputs = await upstreamDef.evaluate({ node: upstreamNode, inputs: upstreamInputs, ctx });
  resolving.delete(outputCacheKey);

  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "output" && pinDef.type !== "exec") {
      ctx.tickCache.set(`${upstreamNode.id}:${pinDef.id}`, outputs[pinDef.id]);
    }
  }

  return ctx.tickCache.get(outputCacheKey);
}

/** Walks the exec chain starting at (nodeId, execInPin), awaiting each node's execute(). */
export async function runExecFrom(
  nodeId: string,
  execInPin: string,
  ctx: ExecutionContext,
): Promise<void> {
  const queue: Array<{ nodeId: string; execInPin: string }> = [{ nodeId, execInPin }];

  while (queue.length > 0) {
    const step = queue.shift()!;
    const node = findNode(ctx.graph, step.nodeId);
    const def = getNodeDef(node.type);
    if (!def.execute) {
      throw new Error(`Node "${node.type}" (${node.id}) has no execute() but is on the exec chain`);
    }

    await ctx.onNodeStart?.(node.id);

    const pinDefs = resolvePinDefs(node, ctx.graph.variables);
    const inputs: Record<string, unknown> = {};
    for (const pinDef of pinDefs) {
      if (pinDef.direction === "input" && pinDef.type !== "exec") {
        inputs[pinDef.id] = await resolveDataPin(node.id, pinDef.id, ctx);
      }
    }

    const result = await def.execute({ node, inputs, ctx });
    const nextExecPins = result.nextExec
      ? Array.isArray(result.nextExec)
        ? result.nextExec
        : [result.nextExec]
      : [];

    for (const execOutPin of nextExecPins) {
      for (const conn of connectionsFrom(ctx.graph, node.id, execOutPin)) {
        ctx.onExecFire?.(conn.id);
        queue.push({ nodeId: conn.toNode, execInPin: conn.toPin });
      }
    }
  }
}
