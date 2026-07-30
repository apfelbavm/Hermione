import "./style.css";
import { registerBuiltins } from "./nodes";
import { createExecutionContext, runExecFrom } from "./engine/executor";
import { connectPins, insertRerouteOnConnection, removeInstancePin } from "./engine/graphMutations";
import { canCollapseSelectionToFunction, collapseSelectionToFunction } from "./engine/collapseToFunction";
import { connectionsTouchingPin } from "./engine/graphQueries";
import { allNodeDefs, findCompatibleNodeDefs, getNodeDef, isPinTypeCompatible, topLevelGroup } from "./engine/registry";
import type { CodeScriptDef, FunctionDef, NodeDef, Variable } from "./engine/types";
import { buildDemoGraph } from "./demoGraph";
import { Camera } from "./render/camera";
import { computeAllNodeGeometries, computeNodeWorldRect } from "./render/nodeGeometry";
import { hitTestNode, hitTestPin, hitTestWire } from "./render/hitTest";
import { drawComments } from "./render/drawComments";
import { drawGrid, snapPositionToGrid } from "./render/drawGrid";
import { drawMouseCoordinates } from "./render/drawHud";
import { drawNodes } from "./render/drawNodes";
import { drawWires, drawWireDragPreview } from "./render/drawWires";
import { drawMarqueeSelection } from "./render/drawMarquee";
import { createStore, getEditingGraph, getVisibleVariablesForState } from "./state/store";
import { createHistoryManager } from "./state/history";
import { selectAllNodes, setupPointerInteraction, type WireAnchor } from "./interaction/pointerHandlers";
import { createWidgetSync } from "./overlay/widgetSync";
import { createNodeDescriptionOverlay } from "./overlay/nodeDescriptionOverlay";
import { setupNodeHoverTooltip } from "./overlay/nodeTooltip";
import { createCommentOverlay } from "./overlay/commentOverlay";
import { setupResizablePanels } from "./overlay/resizablePanels";
import { createVariablePanel } from "./overlay/variablePanel";
import { createFunctionsPanel } from "./overlay/functionsPanel";
import { createFunctionIoPanel } from "./overlay/functionIoPanel";
import { createScriptsPanel } from "./overlay/scriptsPanel";
import { createScriptIoPanel } from "./overlay/scriptIoPanel";
import { createScriptEditor } from "./overlay/scriptEditor";
import { createDetailsPanel } from "./overlay/detailsPanel";
import { createGraphTabs } from "./overlay/graphTabs";
import { openNodeSearchMenu } from "./overlay/nodeSearchMenu";
import { FUNCTION_DRAG_MIME, SCRIPT_DRAG_MIME, VARIABLE_DRAG_MIME } from "./overlay/dragTypes";
import { openRowContextMenu, type ContextMenuItem } from "./overlay/rowContextMenu";
import { nextAvailableName } from "./overlay/uniqueName";
import { loadGraphFromFile, loadGraphFromLocalStorage } from "./persistence/load";
import { deleteSavedGraph, downloadGraphAsFile, saveGraphToLocalStorage } from "./persistence/save";
import { downloadCompiledGraph } from "./compiler/codegen";
import { isNodeLatent } from "./engine/latency";
import { NodeInstance } from "./engine/nodeInstance";

registerBuiltins();

const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement;
const container = document.getElementById("canvas-container") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const logPanel = document.getElementById("log-panel") as HTMLDivElement;
const logClearButton = document.getElementById("log-clear-button") as HTMLButtonElement;
const logTabsDynamic = document.getElementById("log-tabs-dynamic") as HTMLDivElement;
const monacoContainer = document.getElementById("monaco-container") as HTMLDivElement;
const logSaveButton = document.getElementById("log-save-button") as HTMLButtonElement;
const logSaveStatus = document.getElementById("log-save-status") as HTMLSpanElement;
const runButton = document.getElementById("run-button") as HTMLButtonElement;
const saveButton = document.getElementById("save-button") as HTMLButtonElement;
const loadButton = document.getElementById("load-button") as HTMLButtonElement;
const downloadButton = document.getElementById("download-button") as HTMLButtonElement;
const compileButton = document.getElementById("compile-button") as HTMLButtonElement;
const deleteButton = document.getElementById("delete-button") as HTMLButtonElement;
const snapToGridCheckbox = document.getElementById("snap-to-grid-checkbox") as HTMLInputElement;
const frameAllButton = document.getElementById("frame-all-button") as HTMLButtonElement;
const loadFileInput = document.getElementById("load-file-input") as HTMLInputElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
if (!ctx) throw new Error("Canvas 2D context unavailable");

// Tracked independently of pointerHandlers.ts's own internal copy (not exposed from there) so the
// bottom-right coordinate readout (see renderCanvas() below) has a value from the very first frame —
// render() itself runs synchronously once during startup (via resizeCanvas(), below), well before
// setupPointerInteraction() is even called later in this file.
let lastMouseScreenPos = { x: 0, y: 0 };
// Coalesces into at most one canvas-only redraw per animation frame, same idea as store's own
// notify() — but deliberately NOT store.notify() itself: that reruns the full render(), including
// every sidebar panel's list.innerHTML = "" rebuild (variablePanel/functionsPanel/scriptsPanel/etc),
// on every single call. Since this fires on EVERY mousemove anywhere on the page (not just over the
// canvas), routing it through store.notify() was rebuilding those panels' row DOM up to 60x/sec —
// destroying the very row element a sidebar drag or click was in the middle of grabbing, which is
// exactly why dragging/selecting sidebar rows got progressively "stuck" the longer a session ran (a
// bigger graph makes each rebuild slower, widening the window where it collides with the gesture).
let canvasRedrawScheduled = false;
function scheduleCanvasRedraw(): void {
  if (canvasRedrawScheduled) return;
  canvasRedrawScheduled = true;
  requestAnimationFrame(() => {
    canvasRedrawScheduled = false;
    renderCanvas();
  });
}
window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  lastMouseScreenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  scheduleCanvasRedraw();
});

const store = createStore({
  rootGraph: loadGraphFromLocalStorage() ?? buildDemoGraph(),
  activeFunctionId: null,
  openFunctionTabs: [],
  openScriptTabs: [],
  activeLowerTabId: null,
  camera: new Camera(),
  snapToGrid: true,
  selectedNodeIds: new Set(),
  selectedCommentId: null,
  executingNodeId: null,
  firedConnectionIds: new Set(),
  wireDrag: null,
  marqueeSelection: null,
  sidebarSelection: null,
});

const history = createHistoryManager(store);

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

const widgetSync = createWidgetSync(overlay, store);
setupNodeHoverTooltip(canvas, store);
const commentOverlay = createCommentOverlay(overlay, canvas, store);
const nodeDescriptionOverlay = createNodeDescriptionOverlay(overlay, store);
const variablePanel = createVariablePanel(
  {
    section: document.getElementById("variables-section") as HTMLDivElement,
    header: document.getElementById("variables-header") as HTMLDivElement,
    list: document.getElementById("variables-list") as HTMLDivElement,
    addButton: document.getElementById("add-variable-button") as HTMLButtonElement,
  },
  store,
  () => store.state.rootGraph,
);

function getActiveFunction(): FunctionDef | null {
  const id = store.state.activeFunctionId;
  if (!id) return null;
  return store.state.rootGraph.functions.find((f) => f.id === id) ?? null;
}

/** The function currently shown in the Details section — driven by sidebarSelection (whichever
 * row was last clicked), not activeFunctionId (which tab is open on the canvas). The two usually
 * agree (clicking a function's name does both) but can diverge, e.g. switching tabs via the
 * graph-tab strip instead of the Functions list. */
function getSelectedFunctionForDetails(): FunctionDef | null {
  const selection = store.state.sidebarSelection;
  if (selection?.kind !== "function") return null;
  return store.state.rootGraph.functions.find((f) => f.id === selection.functionId) ?? null;
}

const functionsPanel = createFunctionsPanel(
  {
    section: document.getElementById("functions-section") as HTMLDivElement,
    header: document.getElementById("functions-header") as HTMLDivElement,
    list: document.getElementById("functions-list") as HTMLDivElement,
    addButton: document.getElementById("add-function-button") as HTMLButtonElement,
  },
  store,
);

const inputsPanel = createFunctionIoPanel(
  {
    section: document.getElementById("inputs-section") as HTMLDivElement,
    header: document.getElementById("inputs-header") as HTMLDivElement,
    list: document.getElementById("inputs-list") as HTMLDivElement,
    addButton: document.getElementById("add-input-button") as HTMLButtonElement,
  },
  store,
  "input",
  getSelectedFunctionForDetails,
);

const outputsPanel = createFunctionIoPanel(
  {
    section: document.getElementById("outputs-section") as HTMLDivElement,
    header: document.getElementById("outputs-header") as HTMLDivElement,
    list: document.getElementById("outputs-list") as HTMLDivElement,
    addButton: document.getElementById("add-output-button") as HTMLButtonElement,
  },
  store,
  "output",
  getSelectedFunctionForDetails,
);

const scriptsPanel = createScriptsPanel(
  {
    section: document.getElementById("scripts-section") as HTMLDivElement,
    header: document.getElementById("scripts-header") as HTMLDivElement,
    list: document.getElementById("scripts-list") as HTMLDivElement,
    addButton: document.getElementById("add-script-button") as HTMLButtonElement,
  },
  store,
);

/** Mirrors getSelectedFunctionForDetails, for the Scripts panel's own Details sub-view. */
function getSelectedScriptForDetails(): CodeScriptDef | null {
  const selection = store.state.sidebarSelection;
  if (selection?.kind !== "script") return null;
  return store.state.rootGraph.scripts.find((s) => s.id === selection.scriptId) ?? null;
}

const scriptInputsPanel = createScriptIoPanel(
  {
    section: document.getElementById("script-inputs-section") as HTMLDivElement,
    header: document.getElementById("script-inputs-header") as HTMLDivElement,
    list: document.getElementById("script-inputs-list") as HTMLDivElement,
    addButton: document.getElementById("add-script-input-button") as HTMLButtonElement,
  },
  store,
  "input",
  getSelectedScriptForDetails,
);

const scriptOutputsPanel = createScriptIoPanel(
  {
    section: document.getElementById("script-outputs-section") as HTMLDivElement,
    header: document.getElementById("script-outputs-header") as HTMLDivElement,
    list: document.getElementById("script-outputs-list") as HTMLDivElement,
    addButton: document.getElementById("add-script-output-button") as HTMLButtonElement,
  },
  store,
  "output",
  getSelectedScriptForDetails,
);

const scriptEditor = createScriptEditor(
  {
    tabsContainer: logTabsDynamic,
    logPanel,
    monacoContainer,
    saveButton: logSaveButton,
    saveStatus: logSaveStatus,
    clearButton: logClearButton,
  },
  store,
);

const localVariablesSection = document.getElementById("local-variables-section") as HTMLDivElement;
const localVariablePanel = createVariablePanel(
  {
    section: localVariablesSection,
    header: document.getElementById("local-variables-header") as HTMLDivElement,
    list: document.getElementById("local-variables-list") as HTMLDivElement,
    addButton: document.getElementById("add-local-variable-button") as HTMLButtonElement,
  },
  store,
  () => getActiveFunction()?.body ?? store.state.rootGraph,
);

const graphTabs = createGraphTabs(document.getElementById("graph-tabs") as HTMLDivElement, store);

const detailsPanel = createDetailsPanel(
  {
    section: document.getElementById("details-section") as HTMLDivElement,
    variableContent: document.getElementById("variable-details") as HTMLDivElement,
    variableNameLabel: document.getElementById("variable-details-name") as HTMLDivElement,
    variableFieldsContainer: document.getElementById("variable-details-fields") as HTMLDivElement,
    nodeContent: document.getElementById("node-details") as HTMLDivElement,
    nodeNameLabel: document.getElementById("node-details-name") as HTMLDivElement,
    nodeFieldsContainer: document.getElementById("node-details-fields") as HTMLDivElement,
    commentContent: document.getElementById("comment-details") as HTMLDivElement,
    commentFieldsContainer: document.getElementById("comment-details-fields") as HTMLDivElement,
    functionContent: document.getElementById("function-details") as HTMLDivElement,
    functionFieldsContainer: document.getElementById("function-details-fields") as HTMLDivElement,
    scriptContent: document.getElementById("script-details") as HTMLDivElement,
  },
  store,
);

/** The cheap, purely-visual half of a frame: canvas drawing + the DOM overlays that sit directly on
 * top of it (widgetSync, comment titles, per-node description bubbles). Safe to run on every
 * mousemove regardless of the graph's size — unlike render() below, it never touches a sidebar
 * panel's DOM. */
function renderCanvas(): void {
  const { camera, selectedNodeIds, selectedCommentId, executingNodeId, firedConnectionIds, wireDrag, marqueeSelection } = store.state;
  const graph = getEditingGraph(store.state);
  const variables = getVisibleVariablesForState(store.state);
  const functions = store.state.rootGraph.functions;
  const scripts = store.state.rootGraph.scripts;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  drawGrid(ctx, camera, width, height);
  drawComments(ctx, graph, camera, selectedCommentId);
  const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);
  drawWires(ctx, graph, camera, geometries, firedConnectionIds, variables, functions, scripts);
  if (wireDrag) drawWireDragPreview(ctx, wireDrag);
  const latentNodeIds = new Set(graph.nodes.filter((n) => isNodeLatent(n, graph, store.state.rootGraph)).map((n) => n.id));
  drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId, variables, functions, scripts, latentNodeIds);
  if (marqueeSelection) drawMarqueeSelection(ctx, camera, marqueeSelection);
  drawMouseCoordinates(ctx, camera.screenToWorld(lastMouseScreenPos.x, lastMouseScreenPos.y), width, height);
  widgetSync.sync(geometries);
  commentOverlay.sync();
  nodeDescriptionOverlay.sync(geometries);
}

function render(): void {
  renderCanvas();
  variablePanel.render();
  functionsPanel.render();
  inputsPanel.render();
  outputsPanel.render();
  scriptsPanel.render();
  scriptInputsPanel.render();
  scriptOutputsPanel.render();
  scriptEditor.render();
  graphTabs.render();
  detailsPanel.render();
  snapToGridCheckbox.checked = store.state.snapToGrid;

  const activeFn = getActiveFunction();
  localVariablesSection.style.display = activeFn ? "" : "none";
  if (activeFn) localVariablePanel.render();
}

store.subscribe(render);
window.addEventListener("resize", resizeCanvas);
// Also re-fits the canvas whenever its container's size changes for any OTHER reason — notably
// dragging the sidebar/log-panel resize handles (see resizablePanels.ts), which changes layout
// without ever firing a window "resize" event.
new ResizeObserver(resizeCanvas).observe(container);
resizeCanvas();
setupResizablePanels();

snapToGridCheckbox.addEventListener("change", () => {
  store.state.snapToGrid = snapToGridCheckbox.checked;
  store.notify();
});

/** Snaps a newly placed node's spawn position to the grid when the toolbar toggle is on — never
 * applied to nodes already in the graph, only at the moment a new one is dropped/placed. */
function applySnapIfEnabled(worldPos: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return store.state.snapToGrid ? snapPositionToGrid(worldPos) : worldPos;
}

/** Narrows a candidate list down to what's actually placeable in the graph currently open for
 * editing — event nodes (On Start/On Interval/On Run) can't go inside a function body, at most one
 * instance of each event type may exist per graph (see canPlaceNodeType), and reroute nodes (the
 * "Internal" group — see reroute.ts) are never generically creatable at all: their pin type is
 * frozen from whatever wire they get spliced into (see insertRerouteOnConnection), so dropped fresh
 * with no wire context there'd be no sensible type to give them. */
function filterCreatableHere(defs: NodeDef[]): NodeDef[] {
  const graph = getEditingGraph(store.state);
  const isFunctionBody = store.state.activeFunctionId !== null;
  return defs.filter((def) => topLevelGroup(def.group) !== "Internal" && graph.canPlaceNodeType(def.type, isFunctionBody));
}

/** Creates a node at worldPos and, if any anchors are given, auto-connects ALL of them to the same
 * first compatible pin (a plain pick passes one anchor; picking a node after a Ctrl+drag pickup —
 * see pointerHandlers.ts's "wire-multi" mode — passes every anchor it grabbed, reconnecting them
 * all to this one new node in a single motion). */
function createNodeAndMaybeConnect(def: NodeDef, worldPos: { x: number; y: number }, anchors: WireAnchor[] = []): void {
  const graph = getEditingGraph(store.state);
  const node = NodeInstance.createNodeInstance(def.type, applySnapIfEnabled(worldPos), def.pins);
  graph.addNode(node);

  if (anchors.length > 0) {
    const wantDirection = anchors[0].pin.direction === "output" ? "input" : "output";
    const matchPin = def.pins.find((p) => p.direction === wantDirection && isPinTypeCompatible(anchors[0].pin, p));
    if (matchPin) {
      for (const anchor of anchors) {
        const anchorIsOutput = anchor.pin.direction === "output";
        const outputEnd = anchorIsOutput ? anchor : { nodeId: node.id, pinId: matchPin.id };
        const inputEnd = anchorIsOutput ? { nodeId: node.id, pinId: matchPin.id } : anchor;
        connectPins(
          graph,
          getVisibleVariablesForState(store.state),
          store.state.rootGraph.functions,
          {
            fromNode: outputEnd.nodeId,
            fromPin: outputEnd.pinId,
            toNode: inputEnd.nodeId,
            toPin: inputEnd.pinId,
          },
          store.state.rootGraph.scripts,
        );
      }
    }
  }

  store.notify();
}

const pointerInteraction = setupPointerInteraction(canvas, store, history, {
  onWireDroppedInEmptySpace: (anchors, screenPos) => {
    const shared = anchors[0].pin;
    const candidates = filterCreatableHere(findCompatibleNodeDefs(shared, shared.direction));
    const worldPos = store.state.camera.screenToWorld(screenPos.x, screenPos.y);
    openNodeSearchMenu(overlay, {
      screenPos,
      candidates,
      onPick: (def) => createNodeAndMaybeConnect(def, worldPos, anchors),
      onCancel: () => {},
    });
  },
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  // A right-drag pan just moved the camera — don't also pop the menu at the release point.
  if (pointerInteraction.shouldSuppressContextMenu()) return;
  const rect = canvas.getBoundingClientRect();
  const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  // Right-clicking a pin offers to delete it (if it's a removable entry, e.g. one of Append
  // String's string slots) and/or break whatever it's connected to — instead of opening the
  // node-creation menu.
  const graph = getEditingGraph(store.state);
  const variables = getVisibleVariablesForState(store.state);
  const functions = store.state.rootGraph.functions;
  const scripts = store.state.rootGraph.scripts;
  const geometries = computeAllNodeGeometries(graph, store.state.camera, variables, functions, scripts);
  const pinHit = hitTestPin(graph, geometries, screenPos.x, screenPos.y);
  if (pinHit) {
    const items: ContextMenuItem[] = [];

    if (pinHit.pin.removable) {
      items.push({
        label: "Delete",
        onClick: () => {
          removeInstancePin(graph, pinHit.nodeId, pinHit.pinId);
          store.notify();
        },
      });
    }

    const touching = connectionsTouchingPin(graph, pinHit.nodeId, pinHit.pinId);
    for (const conn of touching) {
      const otherIsFromEnd = conn.toNode === pinHit.nodeId && conn.toPin === pinHit.pinId;
      const otherNode = graph.nodes.find((n) => n.id === (otherIsFromEnd ? conn.fromNode : conn.toNode));
      const otherLabel = otherNode ? otherNode.resolveNodeLabel(getNodeDef(otherNode.type), variables, functions, scripts) : "?";
      items.push({
        // Only distinguish by destination when there's more than one to choose between (a fanned-out
        // data output, or an exec input converging several branches) — otherwise it's unambiguous.
        label: touching.length > 1 ? `Break Connection → ${otherLabel}` : "Break Connection",
        onClick: () => {
          graph.removeConnection(variables, functions, conn.id, scripts);
          store.notify();
        },
      });
    }

    if (items.length > 0) {
      openRowContextMenu({ x: e.clientX, y: e.clientY }, items);
      return;
    }
  }

  // Right-clicking a node's body (not a pin) offers to delete it, and — for anything that can
  // actually execute — toggle it disabled/enabled.
  const nodeHit = hitTestNode(graph, geometries, screenPos.x, screenPos.y);
  if (nodeHit) {
    const node = graph.nodes.find((n) => n.id === nodeHit.nodeId)!;

    // Right-clicking a node also selects it — same "replace the selection, unless it's already part
    // of one" rule the left-click mousedown handler uses (see pointerHandlers.ts), so right-clicking
    // within an existing multi-selection keeps the whole group intact (Delete/Disable then apply to
    // all of them) instead of collapsing it down to just the one node under the cursor.
    if (!store.state.selectedNodeIds.has(node.id)) {
      store.state.selectedNodeIds = new Set([node.id]);
      store.state.selectedCommentId = null;
    }

    const items: ContextMenuItem[] = [
      {
        label: "Delete (Del)",
        onClick: () => {
          graph.removeNode(variables, functions, node.id, scripts);
          store.notify();
        },
      },
    ];

    // Operates on the FULL current selection (unlike Delete/Disable above, which only ever act on
    // the single right-clicked node) — the whole point is collapsing a multi-node selection, and by
    // this point selectedNodeIds already reflects either that multi-selection (if the right-clicked
    // node was already part of it) or the single node it was just replaced with (see above).
    const selection = store.state.selectedNodeIds;
    items.push({
      label: "Collapse to Function",
      disabled: !canCollapseSelectionToFunction(store.state.rootGraph, graph, selection, variables, functions, scripts),
      onClick: () => {
        const name = nextAvailableName(store.state.rootGraph.functions.map((f) => f.name), "NewFunction");
        const { callNodeId } = collapseSelectionToFunction(store.state.rootGraph, graph, selection, variables, functions, scripts, name);
        store.state.selectedNodeIds = new Set([callNodeId]);
        store.notify();
      },
    });

    if (node.canToggleDisabled(variables, functions, scripts)) {
      const isDisabled = !!node.disabled;
      // Re-enabling is always allowed; disabling is blocked while something depends on one of this
      // node's data outputs, since a disabled node's evaluate() never runs to produce it.
      const blocked = !isDisabled && graph.hasConnectedDataOutput(node.id, variables, functions, scripts);
      items.push({
        label: isDisabled ? "Enable" : "Disable",
        disabled: blocked,
        onClick: () => {
          node.disabled = !isDisabled;
          store.notify();
        },
      });
    }

    items.push({
      label: "Select All (Ctrl+A)",
      onClick: () => {
        store.state.selectedNodeIds = selectAllNodes(graph);
        store.state.selectedCommentId = null;
        store.notify();
      },
    });

    openRowContextMenu({ x: e.clientX, y: e.clientY }, items);
    store.notify();
    return;
  }

  // Right-clicking a wire itself (not one of its endpoint pins) offers to splice a Reroute node
  // into it — Unreal's "Add Reroute Node," purely for bending the wire's path on the canvas.
  const wireHit = hitTestWire(graph, geometries, store.state.camera, screenPos.x, screenPos.y);
  if (wireHit) {
    const worldPos = store.state.camera.screenToWorld(screenPos.x, screenPos.y);
    openRowContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        label: "Add Reroute Node",
        onClick: () => {
          insertRerouteOnConnection(graph, variables, functions, wireHit.connectionId, worldPos, scripts);
          store.notify();
        },
      },
    ]);
    return;
  }

  const worldPos = store.state.camera.screenToWorld(screenPos.x, screenPos.y);
  const activeFn = getActiveFunction();
  // Return is the one exception to the "Functions group isn't generically creatable" rule below —
  // inside a function body it's pinned to the top of the menu instead, bound to whichever function
  // is currently open (a function body can hold several Return nodes, one per exec branch).
  const returnDef = activeFn ? getNodeDef("function.return") : undefined;

  openNodeSearchMenu(overlay, {
    screenPos,
    // Get/Set Variable nodes need a variable bound via the Variables panel, Entry/Call nodes need a
    // function bound via the Functions panel, and Code needs a script bound via the Scripts panel —
    // none of the three is generically creatable here.
    candidates: filterCreatableHere(allNodeDefs().filter((def) => !["Variables", "Functions", "Code"].includes(topLevelGroup(def.group)))),
    pinned: returnDef ? [returnDef] : undefined,
    onPick: (def) => {
      if (def.type === "function.return" && activeFn) spawnReturnNodeAt(activeFn, worldPos);
      else createNodeAndMaybeConnect(def, worldPos);
    },
    onCancel: () => {},
  });
});

// --- Drag a Functions/Variables sidebar row onto the canvas: dropping a function spawns a Call
// node bound to it at the drop point; dropping a variable pops a Get/Set choice at the drop point.
function spawnCallNodeAt(fn: FunctionDef, worldPos: { x: number; y: number }): void {
  const def = getNodeDef("function.call");
  const pinDefs = def.deriveFunctionPins!(fn);
  const node = NodeInstance.createNodeInstance("function.call", applySnapIfEnabled(worldPos), pinDefs, undefined, undefined, fn.id);
  getEditingGraph(store.state).addNode(node);
  store.notify();
}

function spawnVariableNodeAt(type: "variable.get" | "variable.set", variable: Variable, worldPos: { x: number; y: number }): void {
  const def = getNodeDef(type);
  const pinDefs = def.derivePins!(variable);
  const node = NodeInstance.createNodeInstance(type, applySnapIfEnabled(worldPos), pinDefs, undefined, variable.id);
  getEditingGraph(store.state).addNode(node);
  store.notify();
}

function spawnCodeNodeAt(script: CodeScriptDef, worldPos: { x: number; y: number }): void {
  const def = getNodeDef("code.run");
  const pinDefs = def.deriveScriptPins!(script);
  const node = NodeInstance.createNodeInstance("code.run", applySnapIfEnabled(worldPos), pinDefs, undefined, undefined, undefined, script.id);
  getEditingGraph(store.state).addNode(node);
  store.notify();
}

/** Placed by picking "Return" from the right-click menu inside a function's body (see the
 * contextmenu handler above) — a function body can hold several, one per exec branch. */
function spawnReturnNodeAt(fn: FunctionDef, worldPos: { x: number; y: number }): void {
  const def = getNodeDef("function.return");
  const pinDefs = def.deriveFunctionPins!(fn);
  const node = NodeInstance.createNodeInstance("function.return", applySnapIfEnabled(worldPos), pinDefs, undefined, undefined, fn.id);
  fn.body.addNode(node);
  store.notify();
}

canvas.addEventListener("dragover", (e) => {
  const types = e.dataTransfer?.types;
  if (types?.includes(FUNCTION_DRAG_MIME) || types?.includes(VARIABLE_DRAG_MIME) || types?.includes(SCRIPT_DRAG_MIME)) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
});

canvas.addEventListener("drop", (e) => {
  const functionId = e.dataTransfer?.getData(FUNCTION_DRAG_MIME);
  const variableId = e.dataTransfer?.getData(VARIABLE_DRAG_MIME);
  const scriptId = e.dataTransfer?.getData(SCRIPT_DRAG_MIME);
  if (!functionId && !variableId && !scriptId) return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = store.state.camera.screenToWorld(screenPos.x, screenPos.y);

  if (functionId) {
    const fn = store.state.rootGraph.functions.find((f) => f.id === functionId);
    if (fn) spawnCallNodeAt(fn, worldPos);
    return;
  }

  if (scriptId) {
    const script = store.state.rootGraph.scripts.find((s) => s.id === scriptId);
    if (script) spawnCodeNodeAt(script, worldPos);
    return;
  }

  if (variableId) {
    const variable = getVisibleVariablesForState(store.state).find((v) => v.id === variableId);
    if (!variable) return;
    openRowContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        label: "Get",
        onClick: () => spawnVariableNodeAt("variable.get", variable, worldPos),
      },
      {
        label: "Set",
        onClick: () => spawnVariableNodeAt("variable.set", variable, worldPos),
      },
    ]);
  }
});

// --- Run button: fires every event-root node once (manual test of all entry points), live-highlighting
// nodes/wires and logging Print output. This is an in-editor testing simulation, not real deployment
// behavior — the compiled output (see src/compiler/codegen.ts) is what wires up a real setInterval for
// an "interval"-kind root, etc. All roots share one ExecutionContext so variable state persists across
// them within a single Run click, matching how a real deployed instance shares state across its lifetime.
function appendLog(message: string): void {
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = message;
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
}

logClearButton.addEventListener("click", () => {
  logPanel.innerHTML = "";
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STEP_VISUALIZATION_DELAY_MS = 350;

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  logPanel.innerHTML = "";
  store.state.firedConnectionIds = new Set();

  // Commit any script tab's in-progress (unsaved) Monaco edits first — otherwise a Code node would
  // run whatever was last explicitly saved via the script editor's OWN Save button, silently
  // ignoring anything typed since, which reads as "my changes aren't taking effect."
  await scriptEditor.flushDirtyScripts();

  // On Start/On Interval describe how a *compiled* graph gets triggered outside the editor —
  // the Run button only ever fires On Run nodes.
  const eventRoots = store.state.rootGraph.nodes.filter((n) => n.type === "event.run");
  if (eventRoots.length === 0) {
    appendLog('No "On Run" node in graph — nothing to run.');
    runButton.disabled = false;
    return;
  }

  const execCtx = createExecutionContext(store.state.rootGraph, {
    log: appendLog,
    onNodeStart: async (nodeId) => {
      store.state.executingNodeId = nodeId;
      store.notify();
      await delay(STEP_VISUALIZATION_DELAY_MS);
    },
    onExecFire: (connectionId) => {
      store.state.firedConnectionIds.add(connectionId);
      store.notify();
    },
  });

  try {
    for (const root of eventRoots) {
      await runExecFrom(root.id, "exec-out", execCtx);
    }
  } catch (err) {
    appendLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    store.state.executingNodeId = null;
    store.notify();
    runButton.disabled = false;
  }
});

// --- Save / Load: JSON persisted to localStorage (auto-restored on next launch); Download hands
// that same JSON out as a file, as a separate, explicit action ---
saveButton.addEventListener("click", async () => {
  // See the Run button's identical call for why — this Save button persists the whole GRAPH, not
  // any open script's own (separately buttoned) in-progress edits.
  await scriptEditor.flushDirtyScripts();
  saveGraphToLocalStorage(store.state.rootGraph);
});

loadButton.addEventListener("click", () => loadFileInput.click());

downloadButton.addEventListener("click", async () => {
  await scriptEditor.flushDirtyScripts();
  downloadGraphAsFile(store.state.rootGraph);
});

loadFileInput.addEventListener("change", async () => {
  const file = loadFileInput.files?.[0];
  loadFileInput.value = "";
  if (!file) return;

  try {
    const graph = await loadGraphFromFile(file);
    store.state.rootGraph = graph;
    store.state.activeFunctionId = null;
    store.state.openFunctionTabs = [];
    store.state.openScriptTabs = [];
    store.state.activeLowerTabId = null;
    store.state.sidebarSelection = null;
    store.state.selectedNodeIds = new Set();
    store.state.selectedCommentId = null;
    store.state.executingNodeId = null;
    store.state.firedConnectionIds = new Set();
    saveGraphToLocalStorage(graph);
    store.notify();
  } catch (err) {
    appendLog(`Failed to load graph: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// --- Compile: generates a self-contained .mjs from the graph (see src/compiler/codegen.ts) and downloads it ---
compileButton.addEventListener("click", async () => {
  // See the Run button's identical call for why — otherwise the compiled output would embed
  // whatever a Code node's script was last explicitly saved as, not its current editor contents.
  await scriptEditor.flushDirtyScripts();
  try {
    downloadCompiledGraph(store.state.rootGraph);
  } catch (err) {
    appendLog(`Compile error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// --- Delete: discards the graph persisted via Save (localStorage) — the one auto-restored on next
// launch — then reloads the page so the whole view reflects it immediately (the same fresh-launch
// state loadGraphFromLocalStorage()'s fallback to buildDemoGraph() produces), instead of leaving
// whatever was already open on the canvas showing stale.
deleteButton.addEventListener("click", () => {
  deleteSavedGraph();
  location.reload();
});

// --- Frame All: zooms/pans so every node and comment box in the current graph fits on screen
// (see camera.ts's Camera.frameRect) — a no-op when there's nothing to frame.
frameAllButton.addEventListener("click", () => {
  const graph = getEditingGraph(store.state);
  const variables = getVisibleVariablesForState(store.state);
  const functions = store.state.rootGraph.functions;
  const scripts = store.state.rootGraph.scripts;

  const rects = [
    ...graph.nodes.map((n) => computeNodeWorldRect(n, n.resolvePinDefs(variables, functions, scripts), variables, functions, scripts)),
    ...graph.commentBoxes.map((b) => ({
      x: b.position.x,
      y: b.position.y,
      width: b.size.width,
      height: b.size.height,
    })),
  ];
  if (rects.length === 0) return;

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));

  store.state.camera.frameRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, canvas.clientWidth, canvas.clientHeight);
  store.notify();
});
