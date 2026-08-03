import type { AiGraphApi } from "./AiGraphApi";

/** One AI-callable tool definition, in the shape most chat-completion providers' function/tool
 * calling APIs expect (name + JSON Schema parameters) — see systemPrompt.ts for the accompanying
 * strategy prompt. Kept deliberately small and semantic (section 13 of the design): no tool here
 * ever exposes a raw internal implementation method. */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const nodeIdSchema = { type: "string", description: "A node id as returned by another graph.* tool." };
const portRefSchema = {
  type: "object",
  properties: { nodeId: { type: "string", description: "Real node id or a tempId declared earlier in the same apply_changes batch." }, port: { type: "string" } },
  required: ["nodeId", "port"],
};

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  { name: "graph.get_summary", description: "Compact overview of the current graph: counts, groups, validation/runtime status. Always call this first.", parameters: { type: "object", properties: {} } },
  {
    name: "graph.get_nodes",
    description: "List nodes matching structural filters (ids/types/categories/name/selection/connected-to/region).",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        types: { type: "array", items: { type: "string" } },
        categories: { type: "array", items: { type: "string" } },
        namePattern: { type: "string" },
        connectedToNodeId: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  { name: "graph.get_node", description: "Full detail for one node: properties, ports, connections, metadata, validation.", parameters: { type: "object", properties: { nodeId: nodeIdSchema }, required: ["nodeId"] } },
  {
    name: "graph.find_nodes",
    description: "Semantic node search: by type/name, connected-to, produces/consumes a pin type, or a property's current value.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string" },
        namePattern: { type: "string" },
        connectedToNodeId: { type: "string" },
        consumesFromNodeId: { type: "string" },
        producesType: { type: "string", enum: ["exec", "number", "boolean", "string", "object", "date", "enum", "struct"] },
        propertyEquals: { type: "object", properties: { pinId: { type: "string" }, value: {} }, required: ["pinId", "value"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "graph.get_connections",
    description: "List connections, optionally scoped to one node (incoming/outgoing/both) or between a set of node ids.",
    parameters: { type: "object", properties: { nodeId: { type: "string" }, direction: { type: "string", enum: ["incoming", "outgoing", "both"] }, betweenNodeIds: { type: "array", items: { type: "string" } } } },
  },
  {
    name: "graph.get_node_types",
    description: "Available node types and their metadata (ports, properties, category). Supports filtering so you don't need to load every node type at once.",
    parameters: { type: "object", properties: { category: { type: "string" }, search: { type: "string" }, limit: { type: "number" } } },
  },
  {
    name: "graph.search_node_types",
    description: "Ranked free-text search over node types, e.g. 'JSON text conversion' — use this before creating a node to find/reuse an existing appropriate type.",
    parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  },
  { name: "graph.validate", description: "Structured validation errors/warnings for the whole graph.", parameters: { type: "object", properties: {} } },
  {
    name: "graph.apply_changes",
    description: "Apply one or more create_node/update_node/connect/disconnect/delete_node operations as a single atomic, validated transaction. Use tempId on create_node so later ops in the same call can reference the new node. Set dryRun:true to validate/preview without committing.",
    parameters: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["create_node", "update_node", "connect", "disconnect", "delete_node"] },
              tempId: { type: "string" },
              nodeType: { type: "string" },
              properties: { type: "object" },
              position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
              config: { type: "object", properties: { elementType: { type: "string" }, elementSubType: { type: "string" }, mapKeyType: { type: "string" }, subType: { type: "string" } } },
              nodeId: nodeIdSchema,
              source: portRefSchema,
              target: portRefSchema,
              connectionId: { type: "string" },
              cascade: { type: "boolean" },
            },
            required: ["op"],
          },
        },
        dryRun: { type: "boolean" },
        expectedVersion: { type: "number", description: "The graph version this change set was planned against (see graph.get_summary) — rejected with VERSION_CONFLICT if the graph has moved on." },
      },
      required: ["changes"],
    },
  },
  { name: "graph.undo", description: "Undo the last AI-applied change set.", parameters: { type: "object", properties: {} } },
  { name: "graph.redo", description: "Redo the last undone AI change set.", parameters: { type: "object", properties: {} } },
  { name: "graph.create_snapshot", description: "Create a lightweight snapshot of the current graph before a large/risky operation.", parameters: { type: "object", properties: { label: { type: "string" } } } },
  { name: "graph.restore_snapshot", description: "Restore a previously created snapshot.", parameters: { type: "object", properties: { snapshotId: { type: "string" } }, required: ["snapshotId"] } },
  {
    name: "graph.run",
    description: "Execute the graph (or a specific event-trigger node) via the interpreter and return status/outputs/errors.",
    parameters: { type: "object", properties: { eventKind: { type: "string" }, nodeIds: { type: "array", items: { type: "string" } } } },
  },
  { name: "graph.get_runtime_errors", description: "Structured runtime errors from a past graph.run, or every run if executionId is omitted.", parameters: { type: "object", properties: { executionId: { type: "string" } } } },
  { name: "graph.get_runtime_state", description: "A node's runtime status/inputs/outputs/error from a past run.", parameters: { type: "object", properties: { nodeId: { type: "string" }, executionId: { type: "string" } }, required: ["nodeId"] } },
  { name: "graph.trace_execution", description: "Ordered node-visit trace for a past run, e.g. ['A','B','C','ERROR'].", parameters: { type: "object", properties: { executionId: { type: "string" } }, required: ["executionId"] } },

  // --- Layout: the AI decides WHAT the graph should look like logically; these tools decide WHERE
  // nodes physically go. Prefer the semantic ones (layout/layout_around/insert_between/align/
  // distribute) — update_node_position is a last resort for when an exact position is genuinely
  // required, never the default way to place a node.
  { name: "graph.get_layout", description: "Full physical layout snapshot: every node's position/size/port geometry, groups, and graph bounds.", parameters: { type: "object", properties: {} } },
  { name: "graph.get_node_layout", description: "One node's position, size, and port geometry.", parameters: { type: "object", properties: { nodeId: nodeIdSchema }, required: ["nodeId"] } },
  {
    name: "graph.get_spatial_relationships",
    description: "Answers spatial questions (which nodes overlap / are left-right-above-below one another / are in the same group) without you having to do geometry yourself.",
    parameters: { type: "object", properties: { nodeIds: { type: "array", items: { type: "string" }, description: "Omit to check every node in the graph." } } },
  },
  {
    name: "graph.layout",
    description: "Run the deterministic layered layout engine over the whole graph or a subgraph/selection. Prefer this over manually positioning nodes.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["graph", "subgraph", "selection"], description: "'graph' lays out everything; 'subgraph'/'selection' require nodeIds and never move anything outside that set." },
        nodeIds: { type: "array", items: { type: "string" } },
        direction: { type: "string", enum: ["LR", "RL", "TB", "BT"], description: "Defaults to LR (left-to-right)." },
        mode: { type: "string", enum: ["tidy", "auto", "incremental", "local"], description: "'tidy'/'auto' recompute a clean layout; 'incremental'/'local' try to preserve the existing arrangement as much as possible." },
      },
    },
  },
  {
    name: "graph.layout_around",
    description: "Place newly-created nodes relative to an existing anchor node without moving the anchor or anything else — use right after creating nodes you want to attach near an existing part of the graph.",
    parameters: {
      type: "object",
      properties: { anchorNodeId: nodeIdSchema, nodeIds: { type: "array", items: { type: "string" } }, direction: { type: "string", enum: ["LR", "RL", "TB", "BT"] } },
      required: ["anchorNodeId", "nodeIds"],
    },
  },
  {
    name: "graph.insert_between",
    description:
      "Splice an already-created node into an existing connection between two nodes (finds the connection, rewires it through the new node by matching compatible ports, and places the new node between them, shifting only what's downstream as needed). Prefer this over manually deleting/recreating connections plus a manual position.",
    parameters: {
      type: "object",
      properties: { newNodeId: nodeIdSchema, beforeNodeId: nodeIdSchema, afterNodeId: nodeIdSchema, beforePort: { type: "string" }, afterPort: { type: "string" } },
      required: ["newNodeId", "beforeNodeId", "afterNodeId"],
    },
  },
  {
    name: "graph.align",
    description: "Align selected nodes' left/right/top/bottom edges or horizontal/vertical centers.",
    parameters: { type: "object", properties: { nodeIds: { type: "array", items: { type: "string" } }, edge: { type: "string", enum: ["left", "right", "top", "bottom", "center-horizontal", "center-vertical"] } }, required: ["nodeIds", "edge"] },
  },
  {
    name: "graph.distribute",
    description: "Evenly space selected nodes horizontally or vertically between the first and last node in the set.",
    parameters: { type: "object", properties: { nodeIds: { type: "array", items: { type: "string" } }, axis: { type: "string", enum: ["horizontal", "vertical"] } }, required: ["nodeIds", "axis"] },
  },
  { name: "graph.fit_layout", description: "Recompute a clean layered layout for the ENTIRE graph — use for an explicit 'tidy/rearrange everything' request, not for small local changes.", parameters: { type: "object", properties: { direction: { type: "string", enum: ["LR", "RL", "TB", "BT"] } } } },
  {
    name: "graph.update_node_position",
    description: "Explicitly move one node to an exact position. Last resort — prefer graph.layout/graph.layout_around/graph.insert_between so the layout engine computes coordinates for you.",
    parameters: { type: "object", properties: { nodeId: nodeIdSchema, x: { type: "number" }, y: { type: "number" } }, required: ["nodeId", "x", "y"] },
  },
];

/** Executes one tool call by name against `api` — the only place a tool name string is mapped to
 * a real AiGraphApi method, so AI_TOOL_DEFINITIONS and this dispatcher can never drift apart. */
export async function dispatchTool(api: AiGraphApi, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case "graph.get_summary":
      return api.getSummary();
    case "graph.get_nodes":
      return api.getNodes(args as never);
    case "graph.get_node":
      return api.getNode(args.nodeId as string);
    case "graph.find_nodes":
      return api.findNodes(args as never);
    case "graph.get_connections":
      return api.getConnections(args as never);
    case "graph.get_node_types":
      return api.getNodeTypes(args as never);
    case "graph.search_node_types":
      return api.searchNodeTypes(args.query as string, args.limit as number | undefined);
    case "graph.validate":
      return api.validate();
    case "graph.apply_changes":
      return api.applyChanges(args as never);
    case "graph.undo":
      return api.undo();
    case "graph.redo":
      return api.redo();
    case "graph.create_snapshot":
      return api.createSnapshot(args.label as string | undefined);
    case "graph.restore_snapshot":
      return api.restoreSnapshot(args.snapshotId as string);
    case "graph.run":
      return api.run(args as never);
    case "graph.get_runtime_errors":
      return api.getRuntimeErrors(args.executionId as string | undefined);
    case "graph.get_runtime_state":
      return api.getRuntimeState(args.nodeId as string, args.executionId as string | undefined);
    case "graph.trace_execution":
      return api.traceExecution(args.executionId as string);
    case "graph.get_layout":
      return api.getLayout();
    case "graph.get_node_layout":
      return api.getNodeLayout(args.nodeId as string);
    case "graph.get_spatial_relationships":
      return api.getSpatialRelationships(args.nodeIds as string[] | undefined);
    case "graph.layout":
      return api.layout(args as never);
    case "graph.layout_around":
      return api.layoutAround(args as never);
    case "graph.insert_between":
      return api.insertBetween(args as never);
    case "graph.align":
      return api.align(args.nodeIds as string[], args.edge as never);
    case "graph.distribute":
      return api.distribute(args.nodeIds as string[], args.axis as never);
    case "graph.fit_layout":
      return api.fitLayout(args.direction as never);
    case "graph.update_node_position":
      return api.updateNodePosition(args.nodeId as string, args.x as number, args.y as number);
    default:
      throw new Error(`Unknown AI graph tool "${name}"`);
  }
}
