import { connectionsFrom, connectionTo } from "../engine/graphQueries";
import { resolvePinDefs } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { Graph, NodeInstance } from "../engine/types";
import { indent } from "../engine/compileUtils";

export interface TriggerDescriptor {
  nodeId: string;
  kind: string;
  functionName: string;
  details: Record<string, unknown>;
}

export interface CompileResult {
  code: string;
  manifest: { triggers: TriggerDescriptor[] };
}

function findNode(graph: Graph, nodeId: string): NodeInstance {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found in graph`);
  return node;
}

/** Compile-time counterpart of resolveDataPin: returns a JS expression string instead of a value. */
function compileResolveDataPin(graph: Graph, nodeId: string, pinId: string, helpers: Map<string, string>): string {
  const node = findNode(graph, nodeId);
  const pin = node.pins[pinId];
  const conn = connectionTo(graph, nodeId, pinId);

  if (!conn) {
    return JSON.stringify(pin?.value ?? null);
  }

  const upstreamNode = findNode(graph, conn.fromNode);
  const upstreamDef = getNodeDef(upstreamNode.type);
  if (!upstreamDef.compileEvaluate) {
    throw new Error(
      `Node type "${upstreamNode.type}" has no compileEvaluate — cannot compile this graph yet`,
    );
  }

  const upstreamPinDefs = resolvePinDefs(upstreamNode, graph.variables);
  const upstreamInputs: Record<string, string> = {};
  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      upstreamInputs[pinDef.id] = compileResolveDataPin(graph, upstreamNode.id, pinDef.id, helpers);
    }
  }

  collectHelpers(upstreamDef.compileHelpers, helpers);
  const outputs = upstreamDef.compileEvaluate({ node: upstreamNode, inputs: upstreamInputs, graph });
  const expr = outputs[conn.fromPin];
  if (expr === undefined) {
    throw new Error(
      `Node type "${upstreamNode.type}" compileEvaluate did not return an expression for output pin "${conn.fromPin}"`,
    );
  }
  return expr;
}

function collectHelpers(defHelpers: Record<string, string> | undefined, helpers: Map<string, string>): void {
  if (!defHelpers) return;
  for (const [name, source] of Object.entries(defHelpers)) {
    helpers.set(name, source);
  }
}

/** Compile-time counterpart of runExecFrom's step walk: compiles whatever is wired to (nodeId, execInPin) into statements. */
function compileFrom(
  graph: Graph,
  nodeId: string,
  execInPin: string,
  visiting: Set<string>,
  helpers: Map<string, string>,
): string[] {
  const key = `${nodeId}:${execInPin}`;
  if (visiting.has(key)) {
    throw new Error(`Cyclic exec flow detected at ${key} — loop nodes aren't supported yet`);
  }
  visiting.add(key);

  const node = findNode(graph, nodeId);
  const def = getNodeDef(node.type);
  if (!def.compileExecute) {
    throw new Error(`Node type "${node.type}" has no compileExecute — cannot compile this graph yet`);
  }

  const pinDefs = resolvePinDefs(node, graph.variables);
  const inputs: Record<string, string> = {};
  for (const pinDef of pinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      inputs[pinDef.id] = compileResolveDataPin(graph, node.id, pinDef.id, helpers);
    }
  }

  collectHelpers(def.compileHelpers, helpers);

  const statements = def.compileExecute({
    node,
    inputs,
    graph,
    compileFrom: (execOutPin: string) => {
      const outgoing = connectionsFrom(graph, node.id, execOutPin);
      if (outgoing.length > 1) {
        throw new Error(
          `Node "${node.id}" (${node.type}) exec-out pin "${execOutPin}" fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`,
        );
      }
      if (outgoing.length === 0) return [];
      const [conn] = outgoing;
      return compileFrom(graph, conn.toNode, conn.toPin, visiting, helpers);
    },
  });

  visiting.delete(key);
  return statements;
}

function functionNameFor(node: NodeInstance, usedNames: Set<string>): string {
  const rawName = typeof node.pins.name?.value === "string" ? node.pins.name.value : node.type;
  const slug = rawName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("") || "trigger";

  let candidate = slug;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${slug}${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export function compileGraph(graph: Graph): CompileResult {
  const helpers = new Map<string, string>();
  const usedNames = new Set<string>();
  const triggers: TriggerDescriptor[] = [];
  const functionBlocks: string[] = [];

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    if (!def.eventTrigger) continue;

    const functionName = functionNameFor(node, usedNames);
    const outgoing = connectionsFrom(graph, node.id, "exec-out");
    const body =
      outgoing.length === 0
        ? []
        : (() => {
            if (outgoing.length > 1) {
              throw new Error(
                `Event node "${node.id}" (${node.type}) exec-out fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`,
              );
            }
            const [conn] = outgoing;
            return compileFrom(graph, conn.toNode, conn.toPin, new Set(), helpers);
          })();

    functionBlocks.push(
      [`export async function ${functionName}(rt) {`, ...indent(body), `}`].join("\n"),
    );

    triggers.push({
      nodeId: node.id,
      kind: def.eventTrigger.kind,
      functionName,
      details: def.eventTrigger.describeInstance?.(node) ?? {},
    });
  }

  const stateEntries = graph.variables
    .map((v) => `    ${JSON.stringify(v.id)}: ${JSON.stringify(v.defaultValue)}, // ${v.name}`)
    .join("\n");

  const parts: string[] = [
    `// Generated by Hermione from graph "${graph.name}" — do not edit by hand.`,
    "",
    ...[...helpers.values()],
    "",
    // Callers build rt = { state: createInitialState(), log } themselves and pass the SAME
    // rt into every exported trigger function they invoke, so variable state persists across
    // firings — mirroring how the in-editor Run button shares one ExecutionContext across roots.
    `export function createInitialState() {`,
    `  return {`,
    stateEntries,
    `  };`,
    `}`,
    "",
    ...functionBlocks,
    "",
    `export const manifest = ${JSON.stringify({ triggers }, null, 2)};`,
  ];

  return { code: parts.join("\n"), manifest: { triggers } };
}

/** Compiles the graph and triggers a browser download of the generated source. `.mjs` (not `.js`) so the
 * file runs as ESM under plain `node` regardless of any surrounding package.json — see scripts/compileGraph.ts. */
export function downloadCompiledGraph(graph: Graph, filename: string = `${graph.name || "graph"}.compiled.mjs`): void {
  const { code } = compileGraph(graph);
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
