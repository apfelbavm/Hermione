import { cloneDefaultValue, nextId } from "./graphMutations";
import { getNodeDef } from "./registry";
import {
  CodeScriptDef,
  FunctionDef,
  Pin,
  PinContainer,
  PinDef,
  PinType,
  Variable,
} from "./types";

export class NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  pins: Record<string, Pin>;
  variableId?: string;
  /** Binds this node to a FunctionDef — used by function.entry/return/call, sibling to variableId. */
  functionId?: string;
  /** Binds this node to a CodeScriptDef — used by code.run, sibling to variableId/functionId. */
  scriptId?: string;
  /** Toggled via the canvas right-click menu (see graphMutations.ts's canToggleDisabled/
   * hasConnectedDataOutput) — a disabled node's execute()/compileExecute() is never invoked, by
   * the interpreter or the compiler, and the exec chain simply doesn't continue past it. */
  disabled?: boolean;
  /** Set only for a node whose NodeDef.configurableElementType is set — see that field's doc
   * comment. Seeded by createNodeInstance, changed via changeNodeElementType. */
  elementType?: PinType;
  /** Set only for a node whose NodeDef.configurableElementType?.includeKeyType is set. */
  mapKeyType?: PinType;
  /** Set only for a "core.reroute" data-reroute node (see reroute.ts) — every other
   * configurableElementType node fixes its container via the node TYPE itself (e.g. array.length is
   * always "array"), but a single generic reroute node type has to mimic single/array/set/map alike
   * depending on whichever wire it gets spliced into (see graphMutations.ts's
   * insertRerouteOnConnection), so its container has to live per-instance too. */
  container?: PinContainer;

  constructor(
    id: string,
    type: string,
    position: { x: number; y: number },
    pins: Record<string, Pin>,
    variableId?: string,
    functionId?: string,
    scriptId?: string,
  ) {
    this.id = id;
    this.type = type;
    this.position = position;
    this.pins = pins;
    this.variableId = variableId;
    this.functionId = functionId;
    this.scriptId = scriptId;
    this.disabled = false;
    this.elementType = undefined;
    this.mapKeyType = undefined;
    this.container = undefined;
  }

  /** Seed element/key type for a freshly-created configurableElementType node instance (see
   * NodeDef.configurableElementType) — arbitrary but consistent defaults, same spirit as
   * variablePanel.ts/functionIoPanel.ts always defaulting a brand-new Variable/PinSignatureEntry to
   * type "number". */
  static DEFAULT_ELEMENT_TYPE: PinType = "number";
  static DEFAULT_KEY_TYPE: PinType = "string";

  static createNodeInstance(
    type: string,
    position: { x: number; y: number },
    pinDefs: PinDef[],
    id: string = nextId("node"),
    variableId?: string,
    functionId?: string,
    scriptId?: string,
  ): NodeInstance {
    // detailProperties are seeded here (not passed in by the caller) since every caller already
    // identifies the node purely by `type` — looking them up off the registered NodeDef keeps every
    // call site from having to remember to merge them in separately.
    const def = getNodeDef(type);
    const detailProperties = def.detailProperties ?? [];
    const pins: Record<string, Pin> = {};
    for (const entry of [...pinDefs, ...detailProperties]) {
      pins[entry.id] =
        entry.direction === "input"
          ? { value: cloneDefaultValue(entry.defaultValue) }
          : {};
    }
    const node = new NodeInstance(
      id,
      type,
      position,
      pins,
      variableId,
      functionId,
      scriptId,
    );
    if (def.configurableElementType) {
      node.elementType = NodeInstance.DEFAULT_ELEMENT_TYPE;
      if (def.configurableElementType.includeKeyType)
        node.mapKeyType = NodeInstance.DEFAULT_KEY_TYPE;
    }
    return node;
  }

  /** Resolves the pin defs for a node instance, accounting for variable-derived (Get/Set) nodes,
   * function-derived (Entry/Return/Call) nodes, and script-derived (Code) nodes. */
  resolvePinDefs(
    variables: Variable[],
    functions: FunctionDef[],
    scripts: CodeScriptDef[] = [],
  ): PinDef[] {
    const def = getNodeDef(this.type);
    if (def.derivePins && this.variableId) {
      const variable = variables.find((v) => v.id === this.variableId);
      if (variable) return def.derivePins(variable);
    }
    if (def.deriveFunctionPins && this.functionId) {
      const fn = functions.find((f) => f.id === this.functionId);
      if (fn) return def.deriveFunctionPins(fn);
    }
    if (def.deriveScriptPins && this.scriptId) {
      const script = scripts.find((s) => s.id === this.scriptId);
      if (script) return def.deriveScriptPins(script);
    }
    if (def.deriveInstancePins) return def.deriveInstancePins(this);
    return def.pins;
  }
}
