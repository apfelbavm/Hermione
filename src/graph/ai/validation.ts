import { getNodeDef, isPinTypeCompatible, tryGetNodeDef } from "../engine/registry";
import type { PinDef } from "../engine/types";
import { type AiGraphContext, visibleFunctions, visibleScripts, visibleVariables } from "./context";
import type { ValidationError, ValidationResult } from "./types";

/** Checks one literal property value against its PinDef — shared by graph.validate (post-hoc,
 * across the whole graph) and the mutation commands (pre-flight, before writing anything). */
export function validatePropertyValue(pinDef: PinDef, value: unknown, nodeId: string): ValidationError | null {
  if (pinDef.options && pinDef.options.length > 0 && typeof value === "string" && !pinDef.options.includes(value)) {
    return { code: "INVALID_ENUM_VALUE", nodeId, port: pinDef.id, message: `"${value}" is not one of the allowed values for "${pinDef.label}": ${pinDef.options.join(", ")}` };
  }
  if (pinDef.container && pinDef.container !== "single") {
    if (!Array.isArray(value)) return { code: "INVALID_PROPERTY_TYPE", nodeId, port: pinDef.id, message: `"${pinDef.label}" expects a ${pinDef.container}, got ${typeof value}` };
    return null;
  }
  switch (pinDef.type) {
    case "number":
      if (typeof value !== "number") return { code: "INVALID_PROPERTY_TYPE", nodeId, port: pinDef.id, message: `"${pinDef.label}" expects a number, got ${typeof value}` };
      break;
    case "boolean":
      if (typeof value !== "boolean") return { code: "INVALID_PROPERTY_TYPE", nodeId, port: pinDef.id, message: `"${pinDef.label}" expects a boolean, got ${typeof value}` };
      break;
    case "string":
    case "date":
    case "enum":
      if (typeof value !== "string") return { code: "INVALID_PROPERTY_TYPE", nodeId, port: pinDef.id, message: `"${pinDef.label}" expects a string, got ${typeof value}` };
      break;
    default:
      break;
  }
  return null;
}

/** A property (non-exec input pin) counts as required only when its PinDef declares no literal
 * fallback at all — every other input pin always has a real default the engine falls back to. A
 * pin can also opt into being required despite having a default via PinDef.required (see its own
 * doc comment — e.g. sendMail's "to", whose `[]` default is only there to avoid crashing the
 * engine on an unset pin, not because an empty recipient list is ever a valid choice). */
export function isRequiredProperty(pinDef: PinDef): boolean {
  if (pinDef.direction !== "input" || pinDef.type === "exec") return false;
  return pinDef.required === true || pinDef.defaultValue === undefined;
}

export function validateNode(ctx: AiGraphContext, nodeId: string): ValidationError[] {
  const node = ctx.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return [{ code: "UNKNOWN_NODE", message: `Node "${nodeId}" not found` }];

  const def = tryGetNodeDef(node.type);
  if (!def) return [{ code: "UNKNOWN_NODE_TYPE", nodeId, message: `Unknown node type "${node.type}"` }];

  const errors: ValidationError[] = [];
  const pinDefs = node.resolvePinDefs(visibleVariables(ctx), visibleFunctions(ctx), visibleScripts(ctx));

  for (const pinDef of pinDefs) {
    if (pinDef.direction !== "input" || pinDef.type === "exec") continue;
    const pin = node.pins[pinDef.id];
    if (pin?.connectionId) continue;
    const isEmptyContainer = pinDef.container && pinDef.container !== "single" && Array.isArray(pin?.value) && pin.value.length === 0;
    if (isRequiredProperty(pinDef) && (pin?.value === undefined || pin.value === null || isEmptyContainer)) {
      errors.push({ code: "MISSING_REQUIRED_PROPERTY", nodeId, port: pinDef.id, message: `"${pinDef.label}" is required` });
      continue;
    }
    const error = validatePropertyValue(pinDef, pin?.value, nodeId);
    if (error) errors.push(error);
  }

  return errors;
}

/** Static best-effort cycle check over DATA (non-exec) wiring only — exec chains may legitimately
 * loop via loop-body nodes (see NodeDef.latentBodyPins), but a data dependency cycle is always a
 * genuine bug (the interpreter's own resolveDataPin already throws on one at runtime — see
 * executor.ts — this just surfaces the same class of error ahead of time). */
function findDataCycle(ctx: AiGraphContext): string[] | null {
  const dataEdges = new Map<string, Set<string>>();
  for (const conn of ctx.graph.connections) {
    const fromNode = ctx.graph.nodes.find((n) => n.id === conn.fromNode);
    const fromDef = fromNode ? tryGetNodeDef(fromNode.type) : undefined;
    const fromPinDef = fromDef?.pins.find((p) => p.id === conn.fromPin);
    if (fromPinDef?.type === "exec") continue;
    if (!dataEdges.has(conn.fromNode)) dataEdges.set(conn.fromNode, new Set());
    dataEdges.get(conn.fromNode)!.add(conn.toNode);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(nodeId: string, path: string[]): string[] | null {
    if (visiting.has(nodeId)) return [...path, nodeId];
    if (visited.has(nodeId)) return null;
    visiting.add(nodeId);
    for (const next of dataEdges.get(nodeId) ?? []) {
      const cycle = dfs(next, [...path, nodeId]);
      if (cycle) return cycle;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const node of ctx.graph.nodes) {
    const cycle = dfs(node.id, []);
    if (cycle) return cycle;
  }
  return null;
}

export function validateGraph(ctx: AiGraphContext): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const node of ctx.graph.nodes) {
    errors.push(...validateNode(ctx, node.id));
  }

  for (const conn of ctx.graph.connections) {
    const fromNode = ctx.graph.nodes.find((n) => n.id === conn.fromNode);
    const toNode = ctx.graph.nodes.find((n) => n.id === conn.toNode);
    if (!fromNode || !toNode) {
      errors.push({ code: "DANGLING_CONNECTION", message: `Connection "${conn.id}" references a missing node` });
      continue;
    }
    const fromPinDef = fromNode.resolvePinDefs(visibleVariables(ctx), visibleFunctions(ctx), visibleScripts(ctx)).find((p) => p.id === conn.fromPin);
    const toPinDef = toNode.resolvePinDefs(visibleVariables(ctx), visibleFunctions(ctx), visibleScripts(ctx)).find((p) => p.id === conn.toPin);
    if (!fromPinDef || !toPinDef) {
      errors.push({ code: "DANGLING_CONNECTION", message: `Connection "${conn.id}" references a missing port`, nodeId: !fromPinDef ? conn.fromNode : conn.toNode });
      continue;
    }
    if (!isPinTypeCompatible(fromPinDef, toPinDef)) {
      errors.push({ code: "TYPE_MISMATCH", nodeId: conn.toNode, port: conn.toPin, message: `Expected ${fromPinDef.type} but received ${toPinDef.type} on connection "${conn.id}"` });
    }
  }

  const cycle = findDataCycle(ctx);
  if (cycle) {
    errors.push({ code: "DATA_CYCLE", nodeId: cycle[0], message: `Data-pin cycle detected: ${cycle.join(" -> ")}` });
  }

  const eventTypesSeen = new Map<string, number>();
  for (const node of ctx.graph.nodes) {
    const def = tryGetNodeDef(node.type);
    if (!def?.eventTrigger) continue;
    eventTypesSeen.set(node.type, (eventTypesSeen.get(node.type) ?? 0) + 1);
  }
  for (const [type, count] of eventTypesSeen) {
    if (count > 1) warnings.push({ code: "DUPLICATE_EVENT_TRIGGER", message: `Node type "${type}" (${getNodeDef(type).label}) appears ${count} times — only one instance per graph is normally valid` });
  }

  return { valid: errors.length === 0, errors, warnings };
}
