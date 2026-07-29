import { Pin, PinContainer, PinType } from "./types";

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
}
