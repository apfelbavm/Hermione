import { Graph } from "./graph";
import {
  cloneDefaultValue,
  getVisibleVariables,
  resolvePinDefs,
} from "./graphMutations";
import { connectionsFrom, connectionTo } from "./graphQueries";
import { getNodeDef } from "./registry";
import type { ExecutionContext, FunctionDef, NodeInstance } from "./types";

export function findNode(graph: Graph, nodeId: string): NodeInstance {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found in graph`);
  return node;
}

/** Variables visible to whatever ctx.graph currently is — root's own if not nested, or
 * root (global) + ctx.graph's own (local) if a function-call frame has swapped ctx.graph
 * to that function's body. */
function visibleVariables(ctx: ExecutionContext) {
  return getVisibleVariables(ctx.rootGraph, ctx.graph);
}

export function createExecutionContext(
  graph: Graph,
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  const variableValues = new Map<string, unknown>();
  for (const variable of graph.variables) {
    variableValues.set(variable.id, cloneDefaultValue(variable.defaultValue));
  }
  return {
    log: (message: string) => console.log(message),
    ...overrides,
    graph,
    rootGraph: graph,
    tickCache: new Map(),
    execOutputs: new Map(),
    variableValues,
    callDepth: 0,
  };
}

/** Resolves a data-input pin's value: literal, or recursively pulled from an upstream pure node,
 * or (for an upstream exec/action node like a function call) whatever it most recently produced. */
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
  if (ctx.tickCache.has(outputCacheKey))
    return ctx.tickCache.get(outputCacheKey);

  const upstreamNode = findNode(ctx.graph, conn.fromNode);
  const upstreamDef = getNodeDef(upstreamNode.type);

  if (!upstreamDef.evaluate) {
    // Not a pure/data node — if it's an exec/action node (e.g. a function call), its output pins
    // are populated by runExecFrom when it executes, not pulled lazily here. A missing entry means
    // it hasn't run yet in this traversal — a genuine wiring/ordering error, not a stale-cache issue.
    if (upstreamDef.execute) {
      if (!ctx.execOutputs.has(outputCacheKey)) {
        throw new Error(
          `Node "${upstreamNode.type}" (${upstreamNode.id}) hasn't executed yet in this run — ` +
            `its output pin "${conn.fromPin}" can only be read by something that runs after it`,
        );
      }
      return ctx.execOutputs.get(outputCacheKey);
    }
    throw new Error(
      `Node "${upstreamNode.type}" (${upstreamNode.id}) has no evaluate() but is wired to a data pin`,
    );
  }

  if (resolving.has(outputCacheKey)) {
    throw new Error(`Cyclic data-pin dependency detected at ${outputCacheKey}`);
  }
  resolving.add(outputCacheKey);

  // Pins actually in effect for this instance — not the static def.pins, which is empty
  // for variable-derived node types (Get/Set Variable) whose pins depend on the bound Variable.
  const upstreamPinDefs = resolvePinDefs(
    upstreamNode,
    visibleVariables(ctx),
    ctx.rootGraph.functions,
    ctx.rootGraph.scripts,
  );

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

  const outputs = await upstreamDef.evaluate({
    node: upstreamNode,
    inputs: upstreamInputs,
    ctx,
  });
  resolving.delete(outputCacheKey);

  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "output" && pinDef.type !== "exec") {
      ctx.tickCache.set(`${upstreamNode.id}:${pinDef.id}`, outputs[pinDef.id]);
    }
  }

  return ctx.tickCache.get(outputCacheKey);
}

const MAX_EXEC_STEPS = 100_000;

/** Walks the exec chain starting at (nodeId, execInPin), awaiting each node's execute(). */
export async function runExecFrom(
  nodeId: string,
  execInPin: string,
  ctx: ExecutionContext,
): Promise<void> {
  const queue: Array<{ nodeId: string; execInPin: string }> = [
    { nodeId, execInPin },
  ];
  let steps = 0;

  while (queue.length > 0) {
    if (++steps > MAX_EXEC_STEPS) {
      throw new Error(
        `Exec chain exceeded ${MAX_EXEC_STEPS} steps — likely a cyclic wire (loop nodes aren't supported yet)`,
      );
    }
    const step = queue.shift()!;
    const node = findNode(ctx.graph, step.nodeId);

    let nextExecPins: string[];

    if (node.disabled) {
      // Disabled (see NodeInstance.disabled): its own logic never runs — no execute(), no
      // onNodeStart flash, no data outputs produced — but the exec chain still continues past it,
      // firing every exec-OUTPUT pin it has by default (there's no execute() result to tell us
      // which one its own logic would have picked, e.g. a disabled Branch's condition) — UNLESS its
      // NodeDef overrides this via disabledNextExec (see its own doc comment — a loop node must
      // skip straight to "completed" and never fire "loop-body"). For the common case of a plain
      // single exec-in/exec-out node this default is exactly "skip what it does, keep going."
      const disabledNextExec = getNodeDef(node.type).disabledNextExec;
      nextExecPins =
        disabledNextExec ??
        resolvePinDefs(
          node,
          visibleVariables(ctx),
          ctx.rootGraph.functions,
          ctx.rootGraph.scripts,
        )
          .filter((p) => p.direction === "output" && p.type === "exec")
          .map((p) => p.id);
    } else {
      const def = getNodeDef(node.type);
      if (!def.execute) {
        throw new Error(
          `Node "${node.type}" (${node.id}) has no execute() but is on the exec chain`,
        );
      }

      await ctx.onNodeStart?.(node.id);

      // Cleared per exec-step (not once per run): a variable read must reflect whatever the
      // most recent Set Variable step wrote, not a value cached from an earlier step. Within
      // this one step, resolving a diamond-shaped pure subgraph still dedups correctly, since
      // the cache only clears *between* steps.
      ctx.tickCache.clear();

      const pinDefs = resolvePinDefs(
        node,
        visibleVariables(ctx),
        ctx.rootGraph.functions,
        ctx.rootGraph.scripts,
      );
      const inputs: Record<string, unknown> = {};
      for (const pinDef of pinDefs) {
        if (pinDef.direction === "input" && pinDef.type !== "exec") {
          inputs[pinDef.id] = await resolveDataPin(node.id, pinDef.id, ctx);
        }
      }

      const result = await def.execute({ node, inputs, ctx });

      // Clear this node's own prior output-pin entries FIRST, then write whatever it produced this
      // time (possibly nothing) — otherwise a node that produces outputs on one run but not the next
      // would silently keep serving the earlier run's stale value instead of a clear "not run yet" error.
      for (const pinDef of pinDefs) {
        if (pinDef.direction === "output" && pinDef.type !== "exec") {
          ctx.execOutputs.delete(`${node.id}:${pinDef.id}`);
        }
      }
      if (result.outputs) {
        for (const [pinId, value] of Object.entries(result.outputs)) {
          ctx.execOutputs.set(`${node.id}:${pinId}`, value);
        }
      }

      nextExecPins = result.nextExec
        ? Array.isArray(result.nextExec)
          ? result.nextExec
          : [result.nextExec]
        : [];
    }

    for (const execOutPin of nextExecPins) {
      for (const conn of connectionsFrom(ctx.graph, node.id, execOutPin)) {
        ctx.onExecFire?.(conn.id);
        queue.push({ nodeId: conn.toNode, execInPin: conn.toPin });
      }
    }
  }
}

const MAX_CALL_DEPTH = 500;

/** Runs a function's body from its Entry node, given already-resolved argument values, and
 * returns its outputs — defaulted from the function's declared output defaults, overwritten by
 * whichever function.return node fires last (if any). The caller continues regardless of whether
 * any Return node was ever reached; this never blocks. Builds a genuine child ExecutionContext
 * (fresh tickCache/execOutputs/localVariableValues) rather than mutating and restoring the
 * caller's ctx, so a thrown error mid-call can't leave shared state pointed at the callee. */
export async function runFunctionCall(
  fn: FunctionDef,
  argValues: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<Record<string, unknown>> {
  if (ctx.callDepth >= MAX_CALL_DEPTH) {
    throw new Error(
      `Function call depth exceeded ${MAX_CALL_DEPTH} while calling "${fn.name}" — likely unbounded recursion`,
    );
  }

  const localVariableValues = new Map<string, unknown>();
  for (const variable of fn.body.variables) {
    localVariableValues.set(
      variable.id,
      cloneDefaultValue(variable.defaultValue),
    );
  }

  const outputs: Record<string, unknown> = {};
  for (const output of fn.outputs) {
    outputs[output.id] = cloneDefaultValue(output.defaultValue);
  }

  const childCtx: ExecutionContext = {
    ...ctx,
    graph: fn.body,
    tickCache: new Map(),
    execOutputs: new Map(),
    localVariableValues,
    callDepth: ctx.callDepth + 1,
    entryArgs: argValues,
    onReturn: (values) => {
      Object.assign(outputs, values);
    },
  };

  const entryNode = fn.body.nodes.find(
    (n) => n.type === "function.entry" && n.functionId === fn.id,
  );
  if (entryNode) {
    await runExecFrom(entryNode.id, "exec-out", childCtx);
  }

  return outputs;
}
