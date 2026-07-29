import { connectionsFrom, connectionTo } from "../engine/graphQueries";
import { getNodeDef } from "../engine/registry";
import { indent } from "../engine/compileUtils";
import { Graph } from "../engine/graph";
import { NodeInstance } from "../engine/nodeInstance";

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
function compileResolveDataPin(
  graph: Graph,
  nodeId: string,
  pinId: string,
  helpers: Map<string, string>,
  imports: Set<string>,
): string {
  const node = findNode(graph, nodeId);
  const pin = node.pins[pinId];
  const conn = connectionTo(graph, nodeId, pinId);

  if (!conn) {
    return JSON.stringify(pin?.value ?? null);
  }

  const upstreamNode = findNode(graph, conn.fromNode);
  const upstreamDef = getNodeDef(upstreamNode.type);

  // A latent/exec node's data outputs (e.g. an HTTP-calling node's success/error/status) come from
  // compileExecuteOutputs instead of compileEvaluate — see that field's own doc comment for why the
  // two aren't interchangeable. Checked before requiring compileEvaluate, not merely as a fallback,
  // since a node exposing this only ever exposes THIS, never both.
  if (upstreamDef.compileExecuteOutputs) {
    collectHelpers(upstreamDef.compileHelpers, helpers);
    collectImports(upstreamDef.compileImports, imports);
    const outputs = upstreamDef.compileExecuteOutputs({ node: upstreamNode });
    const expr = outputs[conn.fromPin];
    if (expr === undefined) {
      throw new Error(
        `Node type "${upstreamNode.type}" compileExecuteOutputs did not return an expression for output pin "${conn.fromPin}"`,
      );
    }
    return expr;
  }

  if (!upstreamDef.compileEvaluate) {
    throw new Error(
      `Node type "${upstreamNode.type}" has no compileEvaluate — cannot compile this graph yet`,
    );
  }

  const upstreamPinDefs = upstreamNode.resolvePinDefs(
    graph.variables,
    graph.functions,
    graph.scripts,
  );
  const upstreamInputs: Record<string, string> = {};
  for (const pinDef of upstreamPinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      upstreamInputs[pinDef.id] = compileResolveDataPin(
        graph,
        upstreamNode.id,
        pinDef.id,
        helpers,
        imports,
      );
    }
  }

  collectHelpers(upstreamDef.compileHelpers, helpers);
  collectImports(upstreamDef.compileImports, imports);
  const outputs = upstreamDef.compileEvaluate({
    node: upstreamNode,
    inputs: upstreamInputs,
    graph,
  });
  const expr = outputs[conn.fromPin];
  if (expr === undefined) {
    throw new Error(
      `Node type "${upstreamNode.type}" compileEvaluate did not return an expression for output pin "${conn.fromPin}"`,
    );
  }
  return expr;
}

function collectHelpers(
  defHelpers: Record<string, string> | undefined,
  helpers: Map<string, string>,
): void {
  if (!defHelpers) return;
  for (const [name, source] of Object.entries(defHelpers)) {
    helpers.set(name, source);
  }
}

function collectImports(
  defImports: string[] | undefined,
  imports: Set<string>,
): void {
  if (!defImports) return;
  for (const line of defImports) {
    imports.add(line);
  }
}

/** Compile-time counterpart of runExecFrom's step walk: compiles whatever is wired to (nodeId, execInPin) into statements. */
function compileFrom(
  graph: Graph,
  nodeId: string,
  execInPin: string,
  visiting: Set<string>,
  helpers: Map<string, string>,
  imports: Set<string>,
): string[] {
  const key = `${nodeId}:${execInPin}`;
  if (visiting.has(key)) {
    throw new Error(
      `Cyclic exec flow detected at ${key} — loop nodes aren't supported yet`,
    );
  }
  visiting.add(key);

  const node = findNode(graph, nodeId);
  // Disabled (see NodeInstance.disabled): its own compileExecute never runs — instead, splice in
  // the compiled statements for the disabled exec-out pin(s), back to back. Mirrors runExecFrom's
  // disabled handling exactly (see its own comment, and NodeDef.disabledNextExec's), so Run and
  // Compile never disagree: every exec-out pin by default (there's no result to tell us which one
  // its logic would have picked, e.g. a disabled Branch), unless the NodeDef overrides this (a
  // disabled loop node must splice in only "completed", never running "loop-body"). For the common
  // single exec-in/exec-out node this default is just "splice in whatever comes next, unconditionally."
  if (node.disabled) {
    const execOutPins =
      getNodeDef(node.type).disabledNextExec ??
      node
        .resolvePinDefs(graph.variables, graph.functions, graph.scripts)
        .filter((p) => p.direction === "output" && p.type === "exec")
        .map((p) => p.id);

    const statements: string[] = [];
    for (const pinId of execOutPins) {
      for (const conn of connectionsFrom(graph, node.id, pinId)) {
        statements.push(
          ...compileFrom(
            graph,
            conn.toNode,
            conn.toPin,
            visiting,
            helpers,
            imports,
          ),
        );
      }
    }
    visiting.delete(key);
    return statements;
  }
  const def = getNodeDef(node.type);
  if (!def.compileExecute) {
    throw new Error(
      `Node type "${node.type}" has no compileExecute — cannot compile this graph yet`,
    );
  }

  const pinDefs = node.resolvePinDefs(
    graph.variables,
    graph.functions,
    graph.scripts,
  );
  const inputs: Record<string, string> = {};
  for (const pinDef of pinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      inputs[pinDef.id] = compileResolveDataPin(
        graph,
        node.id,
        pinDef.id,
        helpers,
        imports,
      );
    }
  }

  collectHelpers(def.compileHelpers, helpers);
  collectImports(def.compileImports, imports);

  const statements = def.compileExecute({
    node,
    inputs,
    graph,
    compileFrom: (execOutPin: string) => {
      // connectPins now enforces "one wire per exec output" itself, so this can't arise
      // through normal editor use — this guard only catches a hand-edited/corrupted graph.
      const outgoing = connectionsFrom(graph, node.id, execOutPin);
      if (outgoing.length > 1) {
        throw new Error(
          `Node "${node.id}" (${node.type}) exec-out pin "${execOutPin}" fans out to ${outgoing.length} wires — parallel exec fan-out is not supported by the compiler yet`,
        );
      }
      if (outgoing.length === 0) return [];
      const [conn] = outgoing;
      return compileFrom(
        graph,
        conn.toNode,
        conn.toPin,
        visiting,
        helpers,
        imports,
      );
    },
  });

  visiting.delete(key);
  return statements;
}

function functionNameFor(node: NodeInstance, usedNames: Set<string>): string {
  const rawName =
    typeof node.pins.name?.value === "string"
      ? node.pins.name.value
      : node.type;
  const slug =
    rawName
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(" ")
      .map((word, i) =>
        i === 0
          ? word.charAt(0).toLowerCase() + word.slice(1)
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
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
  const imports = new Set<string>();
  const usedNames = new Set<string>();
  const triggers: TriggerDescriptor[] = [];
  const functionBlocks: string[] = [];

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    if (!def.eventTrigger) continue;

    const functionName = functionNameFor(node, usedNames);
    // Same defensive-only guard as above: connectPins already enforces this.
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
            return compileFrom(
              graph,
              conn.toNode,
              conn.toPin,
              new Set(),
              helpers,
              imports,
            );
          })();

    functionBlocks.push(
      [
        `export async function ${functionName}(rt) {`,
        ...indent(body),
        `}`,
      ].join("\n"),
    );

    triggers.push({
      nodeId: node.id,
      kind: def.eventTrigger.kind,
      functionName,
      details: def.eventTrigger.describeInstance?.(node) ?? {},
    });
  }

  const stateEntries = graph.variables
    .map(
      (v) =>
        `    ${JSON.stringify(v.id)}: ${JSON.stringify(v.defaultValue)}, // ${v.name}`,
    )
    .join("\n");

  const parts: string[] = [
    `// Generated by Hermione from graph "${graph.name}" — do not edit by hand.`,
    ...(imports.size > 0
      ? [
          "// This graph uses node(s) whose compiled logic depends on an npm package rather than a",
          "// self-contained helper — running this file requires that package to be installed alongside it.",
          ...[...imports.values()],
        ]
      : []),
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
export function downloadCompiledGraph(
  graph: Graph,
  filename: string = `${graph.name || "graph"}.compiled.mjs`,
): void {
  const { code } = compileGraph(graph);
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
