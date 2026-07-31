import { cloneDefaultValue, nextId } from "./graphMutations";
import { getNodeDef } from "./registry";
import { CodeScriptDef, FunctionDef, NodeDef, Pin, PinContainer, PinDef, PinType, Variable } from "./types";

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
  /** Toggled via the canvas right-click menu (see AppShell.tsx's context menu, excluded for
   * compact/reroute nodes — see NodeDef.compact). When simulating, execution pauses right before
   * this node runs (see /api/simulate/route.ts), same as clicking the toolbar's Pause button, until
   * Continue is clicked. */
  breakpoint?: boolean;
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
  /** User-authored, per-instance note — edited in the Details panel (see detailsPanel.ts) and shown
   * as a small speech-bubble above this node on the canvas whenever it's non-empty (see
   * overlay/nodeDescriptionOverlay.ts). Distinct from NodeDef.description (the node TYPE's static,
   * shared blurb) and from a function.call's own resolveNodeDescription (its bound FunctionDef's
   * description) — this is specific to this one instance, e.g. "remember to reset this before prod". */
  description?: string;

  constructor(id: string, type: string, position: { x: number; y: number }, pins: Record<string, Pin>, variableId?: string, functionId?: string, scriptId?: string) {
    this.id = id;
    this.type = type;
    this.position = position;
    this.pins = pins;
    this.variableId = variableId;
    this.functionId = functionId;
    this.scriptId = scriptId;
    this.disabled = false;
    this.breakpoint = false;
    this.elementType = undefined;
    this.mapKeyType = undefined;
    this.container = undefined;
    this.description = undefined;
  }

  /** Seed element/key type for a freshly-created configurableElementType node instance (see
   * NodeDef.configurableElementType) — arbitrary but consistent defaults, same spirit as
   * variablePanel.ts/functionIoPanel.ts always defaulting a brand-new Variable/PinSignatureEntry to
   * type "number". */
  static DEFAULT_ELEMENT_TYPE: PinType = "number";
  static DEFAULT_KEY_TYPE: PinType = "string";

  static createNodeInstance(type: string, position: { x: number; y: number }, pinDefs: PinDef[], id: string = nextId("node"), variableId?: string, functionId?: string, scriptId?: string): NodeInstance {
    // detailProperties are seeded here (not passed in by the caller) since every caller already
    // identifies the node purely by `type` — looking them up off the registered NodeDef keeps every
    // call site from having to remember to merge them in separately.
    const def = getNodeDef(type);
    const detailProperties = def.detailProperties ?? [];
    const pins: Record<string, Pin> = {};
    for (const entry of [...pinDefs, ...detailProperties]) {
      pins[entry.id] = entry.direction === "input" ? { value: cloneDefaultValue(entry.defaultValue) } : {};
    }
    const node = new NodeInstance(id, type, position, pins, variableId, functionId, scriptId);
    if (def.configurableElementType) {
      node.elementType = NodeInstance.DEFAULT_ELEMENT_TYPE;
      if (def.configurableElementType.includeKeyType) node.mapKeyType = NodeInstance.DEFAULT_KEY_TYPE;
    }
    return node;
  }

  /** Resolves the pin defs for a node instance, accounting for variable-derived (Get/Set) nodes,
   * function-derived (Entry/Return/Call) nodes, and script-derived (Code) nodes. */
  resolvePinDefs(variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): PinDef[] {
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

  /** The display label for a node instance — normally its NodeDef's static label, except: a node
   * bound to a Variable (Get/Set) shows "Get "/"Set " followed by that variable's name (so the graph
   * reads e.g. "Get Score", not the generic "Get Variable" — its own pin is left unlabeled since the
   * title already says it), and a function.call node shows the name of the function it's bound to
   * (so the graph reads e.g. "Double", not the generic "Call Function"), matching how its pins
   * already reflect that function. */
  resolveNodeLabel(def: NodeDef, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): string {
    if (this.variableId) {
      const variable = variables.find((v) => v.id === this.variableId);
      if (variable) {
        if (this.type === "variable.get") return `Get ${variable.name}`;
        if (this.type === "variable.set") return `Set ${variable.name}`;
        return variable.name;
      }
    }
    if (this.type === "function.call" && this.functionId) {
      const fn = functions.find((f) => f.id === this.functionId);
      if (fn) return fn.name;
    }
    if (this.type === "code.run" && this.scriptId) {
      const script = scripts.find((s) => s.id === this.scriptId);
      if (script) return script.name;
    }
    return def.label;
  }

  /** Sibling of resolveNodeLabel for the hover tooltip (see overlay/tooltip.ts/nodeTooltip.ts) — a
   * function.call node shows its bound FunctionDef's own user-authored description (set in the
   * Details panel) when one's been given, since that's far more useful than the generic "Call
   * Function" text; every other node type (including Get/Set Variable and Code, which have no
   * per-instance description of their own) just shows its NodeDef's static description. */
  resolveNodeDescription(def: NodeDef, functions: FunctionDef[]): string {
    if (this.type === "function.call" && this.functionId) {
      const fn = functions.find((f) => f.id === this.functionId);
      if (fn?.description) return fn.description;
    }
    return def.description;
  }

  /** True if this node's canvas right-click menu should offer a Disable/Enable toggle at all — it
   * must have at least one execution pin (a pure data node has no "code" to skip) and must not be an
   * event trigger (an entry point always has to be reachable). Whether disabling is CURRENTLY
   * allowed (vs. greyed out) is a separate question — see hasConnectedDataOutput. */
  canToggleDisabled(variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): boolean {
    const def = getNodeDef(this.type);
    if (def.eventTrigger) return false;
    return this.resolvePinDefs(variables, functions, scripts).some((p) => p.type === "exec");
  }
}
