import type { Graph } from "../engine/graph";
import type { CodeScriptDef, FunctionDef, Variable } from "../engine/types";

/** Everything the AI Graph Control Layer needs to operate on one open graph — usually the root
 * graph itself, or a function's body when the AI is scoped to editing one function. Mirrors what
 * getVisibleVariablesForState/getEditingGraph already compute for the React store (see
 * state/store.ts), just without any React/UI dependency. */
export interface AiGraphContext {
  rootGraph: Graph;
  graph: Graph;
}

export function rootContext(rootGraph: Graph): AiGraphContext {
  return { rootGraph, graph: rootGraph };
}

export function visibleVariables(ctx: AiGraphContext): Variable[] {
  return ctx.rootGraph.getVisibleVariables(ctx.graph);
}

export function visibleFunctions(ctx: AiGraphContext): FunctionDef[] {
  return ctx.rootGraph.functions;
}

export function visibleScripts(ctx: AiGraphContext): CodeScriptDef[] {
  return ctx.rootGraph.scripts;
}

export function findNodeOrThrow(ctx: AiGraphContext, nodeId: string) {
  const node = ctx.graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found`);
  return node;
}
