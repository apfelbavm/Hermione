import "./style.css";
import { registerBuiltins } from "./nodes";
import { createExecutionContext, runExecFrom } from "./engine/executor";
import { addNode, connectPins, createNodeInstance, removeInstancePin } from "./engine/graphMutations";
import {
  allNodeDefs,
  findCompatibleNodeDefs,
  getNodeDef,
  isPinTypeCompatible,
  topLevelGroup,
} from "./engine/registry";
import type { FunctionDef, NodeDef, Variable } from "./engine/types";
import { buildDemoGraph } from "./demoGraph";
import { createCamera, screenToWorld } from "./render/camera";
import { computeAllNodeGeometries } from "./render/nodeGeometry";
import { hitTestPin } from "./render/hitTest";
import { drawComments } from "./render/drawComments";
import { drawGrid, snapPositionToGrid } from "./render/drawGrid";
import { drawNodes } from "./render/drawNodes";
import { drawWires, drawWireDragPreview } from "./render/drawWires";
import { drawMarqueeSelection } from "./render/drawMarquee";
import { createStore, getEditingGraph, getVisibleVariablesForState } from "./state/store";
import { setupPointerInteraction, type WireAnchor } from "./interaction/pointerHandlers";
import { createWidgetSync } from "./overlay/widgetSync";
import { createCommentOverlay } from "./overlay/commentOverlay";
import { createVariablePanel } from "./overlay/variablePanel";
import { createFunctionsPanel } from "./overlay/functionsPanel";
import { createFunctionIoPanel } from "./overlay/functionIoPanel";
import { createDetailsPanel } from "./overlay/detailsPanel";
import { createGraphTabs } from "./overlay/graphTabs";
import { openNodeSearchMenu } from "./overlay/nodeSearchMenu";
import { FUNCTION_DRAG_MIME, VARIABLE_DRAG_MIME } from "./overlay/dragTypes";
import { openRowContextMenu } from "./overlay/rowContextMenu";
import { loadGraphFromFile, loadGraphFromLocalStorage } from "./persistence/load";
import { downloadGraphAsFile, saveGraphToLocalStorage } from "./persistence/save";
import { downloadCompiledGraph } from "./compiler/codegen";

registerBuiltins();

const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement;
const container = document.getElementById("canvas-container") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const logPanel = document.getElementById("log-panel") as HTMLDivElement;
const runButton = document.getElementById("run-button") as HTMLButtonElement;
const saveButton = document.getElementById("save-button") as HTMLButtonElement;
const loadButton = document.getElementById("load-button") as HTMLButtonElement;
const compileButton = document.getElementById("compile-button") as HTMLButtonElement;
const snapToGridCheckbox = document.getElementById("snap-to-grid-checkbox") as HTMLInputElement;
const loadFileInput = document.getElementById("load-file-input") as HTMLInputElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
if (!ctx) throw new Error("Canvas 2D context unavailable");

const store = createStore({
  rootGraph: loadGraphFromLocalStorage() ?? buildDemoGraph(),
  activeFunctionId: null,
  openFunctionTabs: [],
  camera: createCamera(),
  snapToGrid: true,
  selectedNodeIds: new Set(),
  selectedCommentId: null,
  executingNodeId: null,
  firedConnectionIds: new Set(),
  wireDrag: null,
  marqueeSelection: null,
  sidebarSelection: null,
});

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
const commentOverlay = createCommentOverlay(overlay, store);
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
  canvas,
  "input",
  getSelectedFunctionForDetails,
);

const outputsPanel = createFunctionIoPanel(
  {
    section: document.getElementById("outputs-section") as HTMLDivElement,
    header: document.getElementById("outputs-header") as HTMLDivElement,
    list: document.getElementById("outputs-list") as HTMLDivElement,
    addButton: document.getElementById("add-output-button") as HTMLButtonElement,
    spawnReturnButton: document.getElementById("spawn-return-node-button") as HTMLButtonElement,
  },
  store,
  canvas,
  "output",
  getSelectedFunctionForDetails,
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
    functionContent: document.getElementById("function-details") as HTMLDivElement,
  },
  store,
);

function render(): void {
  const {
    camera,
    selectedNodeIds,
    selectedCommentId,
    executingNodeId,
    firedConnectionIds,
    wireDrag,
    marqueeSelection,
  } = store.state;
  const graph = getEditingGraph(store.state);
  const variables = getVisibleVariablesForState(store.state);
  const functions = store.state.rootGraph.functions;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  drawGrid(ctx, camera, width, height);
  drawComments(ctx, graph, camera, selectedCommentId);
  const geometries = computeAllNodeGeometries(graph, camera, variables, functions);
  drawWires(ctx, graph, camera, geometries, firedConnectionIds, variables, functions);
  if (wireDrag) drawWireDragPreview(ctx, wireDrag);
  drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId, functions);
  if (marqueeSelection) drawMarqueeSelection(ctx, camera, marqueeSelection);
  widgetSync.sync(geometries);
  commentOverlay.sync();
  variablePanel.render();
  functionsPanel.render();
  inputsPanel.render();
  outputsPanel.render();
  graphTabs.render();
  detailsPanel.render();
  snapToGridCheckbox.checked = store.state.snapToGrid;

  const activeFn = getActiveFunction();
  localVariablesSection.style.display = activeFn ? "" : "none";
  if (activeFn) localVariablePanel.render();
}

store.subscribe(render);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

snapToGridCheckbox.addEventListener("change", () => {
  store.state.snapToGrid = snapToGridCheckbox.checked;
  store.notify();
});

/** Snaps a newly placed node's spawn position to the grid when the toolbar toggle is on — never
 * applied to nodes already in the graph, only at the moment a new one is dropped/placed. */
function applySnapIfEnabled(worldPos: { x: number; y: number }): { x: number; y: number } {
  return store.state.snapToGrid ? snapPositionToGrid(worldPos) : worldPos;
}

/** Creates a node at worldPos and, if an anchor pin is given, auto-connects it to the first compatible pin. */
function createNodeAndMaybeConnect(
  def: NodeDef,
  worldPos: { x: number; y: number },
  anchor?: WireAnchor,
): void {
  const graph = getEditingGraph(store.state);
  const node = createNodeInstance(def.type, applySnapIfEnabled(worldPos), def.pins);
  addNode(graph, node);

  if (anchor) {
    const wantDirection = anchor.pin.direction === "output" ? "input" : "output";
    const matchPin = def.pins.find(
      (p) => p.direction === wantDirection && isPinTypeCompatible(anchor.pin.type, p.type),
    );
    if (matchPin) {
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
      );
    }
  }

  store.notify();
}

const pointerInteraction = setupPointerInteraction(canvas, store, {
  onWireDroppedInEmptySpace: (anchor, screenPos) => {
    const candidates = findCompatibleNodeDefs(anchor.pin.type, anchor.pin.direction);
    const worldPos = screenToWorld(store.state.camera, screenPos.x, screenPos.y);
    openNodeSearchMenu(overlay, {
      screenPos,
      candidates,
      onPick: (def) => createNodeAndMaybeConnect(def, worldPos, anchor),
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

  // Right-clicking a removable entry pin (e.g. one of Append String's string slots) offers to
  // delete just that entry instead of opening the node-creation menu.
  const graph = getEditingGraph(store.state);
  const variables = getVisibleVariablesForState(store.state);
  const functions = store.state.rootGraph.functions;
  const geometries = computeAllNodeGeometries(graph, store.state.camera, variables, functions);
  const pinHit = hitTestPin(graph, geometries, screenPos.x, screenPos.y);
  if (pinHit?.pin.removable) {
    openRowContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        label: "Delete",
        onClick: () => {
          removeInstancePin(graph, pinHit.nodeId, pinHit.pinId);
          store.notify();
        },
      },
    ]);
    return;
  }

  const worldPos = screenToWorld(store.state.camera, screenPos.x, screenPos.y);
  openNodeSearchMenu(overlay, {
    screenPos,
    // Get/Set Variable nodes need a variable bound via the Variables panel, and Entry/Return/Call
    // nodes need a function bound via the Functions panel — neither is generically creatable here.
    candidates: allNodeDefs().filter((def) => !["Variables", "Functions"].includes(topLevelGroup(def.group))),
    onPick: (def) => createNodeAndMaybeConnect(def, worldPos),
    onCancel: () => {},
  });
});

// --- Drag a Functions/Variables sidebar row onto the canvas: dropping a function spawns a Call
// node bound to it at the drop point; dropping a variable pops a Get/Set choice at the drop point.
function spawnCallNodeAt(fn: FunctionDef, worldPos: { x: number; y: number }): void {
  const def = getNodeDef("function.call");
  const pinDefs = def.deriveFunctionPins!(fn);
  const node = createNodeInstance("function.call", applySnapIfEnabled(worldPos), pinDefs, undefined, undefined, fn.id);
  addNode(getEditingGraph(store.state), node);
  store.notify();
}

function spawnVariableNodeAt(type: "variable.get" | "variable.set", variable: Variable, worldPos: { x: number; y: number }): void {
  const def = getNodeDef(type);
  const pinDefs = def.derivePins!(variable);
  const node = createNodeInstance(type, applySnapIfEnabled(worldPos), pinDefs, undefined, variable.id);
  addNode(getEditingGraph(store.state), node);
  store.notify();
}

canvas.addEventListener("dragover", (e) => {
  const types = e.dataTransfer?.types;
  if (types?.includes(FUNCTION_DRAG_MIME) || types?.includes(VARIABLE_DRAG_MIME)) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
});

canvas.addEventListener("drop", (e) => {
  const functionId = e.dataTransfer?.getData(FUNCTION_DRAG_MIME);
  const variableId = e.dataTransfer?.getData(VARIABLE_DRAG_MIME);
  if (!functionId && !variableId) return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(store.state.camera, screenPos.x, screenPos.y);

  if (functionId) {
    const fn = store.state.rootGraph.functions.find((f) => f.id === functionId);
    if (fn) spawnCallNodeAt(fn, worldPos);
    return;
  }

  if (variableId) {
    const variable = getVisibleVariablesForState(store.state).find((v) => v.id === variableId);
    if (!variable) return;
    openRowContextMenu({ x: e.clientX, y: e.clientY }, [
      { label: "Get", onClick: () => spawnVariableNodeAt("variable.get", variable, worldPos) },
      { label: "Set", onClick: () => spawnVariableNodeAt("variable.set", variable, worldPos) },
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STEP_VISUALIZATION_DELAY_MS = 350;

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  logPanel.innerHTML = "";
  store.state.firedConnectionIds = new Set();

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

// --- Save / Load: JSON persisted to localStorage (auto-restored on next launch) and downloadable as a file ---
saveButton.addEventListener("click", () => {
  saveGraphToLocalStorage(store.state.rootGraph);
  downloadGraphAsFile(store.state.rootGraph);
});

loadButton.addEventListener("click", () => loadFileInput.click());

loadFileInput.addEventListener("change", async () => {
  const file = loadFileInput.files?.[0];
  loadFileInput.value = "";
  if (!file) return;

  try {
    const graph = await loadGraphFromFile(file);
    store.state.rootGraph = graph;
    store.state.activeFunctionId = null;
    store.state.openFunctionTabs = [];
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
compileButton.addEventListener("click", () => {
  try {
    downloadCompiledGraph(store.state.rootGraph);
  } catch (err) {
    appendLog(`Compile error: ${err instanceof Error ? err.message : String(err)}`);
  }
});
