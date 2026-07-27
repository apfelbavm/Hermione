import "./style.css";
import { registerBuiltins } from "./nodes";
import { createExecutionContext, runExecFrom } from "./engine/executor";
import { addNode, connectPins, createNodeInstance } from "./engine/graphMutations";
import {
  allNodeDefs,
  findCompatibleNodeDefs,
  getNodeDef,
  isPinTypeCompatible,
  topLevelGroup,
} from "./engine/registry";
import type { FunctionDef, NodeDef } from "./engine/types";
import { buildDemoGraph } from "./demoGraph";
import { createCamera, screenToWorld } from "./render/camera";
import { computeAllNodeGeometries } from "./render/nodeGeometry";
import { drawComments } from "./render/drawComments";
import { drawGrid } from "./render/drawGrid";
import { drawNodes } from "./render/drawNodes";
import { drawWires, drawWireDragPreview } from "./render/drawWires";
import { createStore, getEditingGraph, getVisibleVariablesForState } from "./state/store";
import { setupPointerInteraction, type WireAnchor } from "./interaction/pointerHandlers";
import { createWidgetSync } from "./overlay/widgetSync";
import { createCommentOverlay } from "./overlay/commentOverlay";
import { createVariablePanel } from "./overlay/variablePanel";
import { createFunctionsPanel } from "./overlay/functionsPanel";
import { createFunctionIoPanel } from "./overlay/functionIoPanel";
import { openNodeSearchMenu } from "./overlay/nodeSearchMenu";
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
const loadFileInput = document.getElementById("load-file-input") as HTMLInputElement;
const backButton = document.getElementById("back-button") as HTMLButtonElement;
const breadcrumb = document.getElementById("breadcrumb") as HTMLSpanElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
if (!ctx) throw new Error("Canvas 2D context unavailable");

const store = createStore({
  rootGraph: loadGraphFromLocalStorage() ?? buildDemoGraph(),
  activeFunctionId: null,
  camera: createCamera(),
  selectedNodeIds: new Set(),
  selectedCommentId: null,
  executingNodeId: null,
  firedConnectionIds: new Set(),
  wireDrag: null,
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
    list: document.getElementById("variables-list") as HTMLDivElement,
    nameInput: document.getElementById("new-variable-name") as HTMLInputElement,
    typeSelect: document.getElementById("new-variable-type") as HTMLSelectElement,
    addButton: document.getElementById("add-variable-button") as HTMLButtonElement,
  },
  store,
  canvas,
  () => store.state.rootGraph,
);

function getActiveFunction(): FunctionDef | null {
  const id = store.state.activeFunctionId;
  if (!id) return null;
  return store.state.rootGraph.functions.find((f) => f.id === id) ?? null;
}

const functionsPanel = createFunctionsPanel(
  {
    list: document.getElementById("functions-list") as HTMLDivElement,
    nameInput: document.getElementById("new-function-name") as HTMLInputElement,
    addButton: document.getElementById("add-function-button") as HTMLButtonElement,
  },
  store,
  canvas,
);

const inputsPanel = createFunctionIoPanel(
  {
    section: document.getElementById("inputs-section") as HTMLDivElement,
    list: document.getElementById("inputs-list") as HTMLDivElement,
    nameInput: document.getElementById("new-input-name") as HTMLInputElement,
    typeSelect: document.getElementById("new-input-type") as HTMLSelectElement,
    addButton: document.getElementById("add-input-button") as HTMLButtonElement,
  },
  store,
  canvas,
  "input",
  getActiveFunction,
);

const outputsPanel = createFunctionIoPanel(
  {
    section: document.getElementById("outputs-section") as HTMLDivElement,
    list: document.getElementById("outputs-list") as HTMLDivElement,
    nameInput: document.getElementById("new-output-name") as HTMLInputElement,
    typeSelect: document.getElementById("new-output-type") as HTMLSelectElement,
    addButton: document.getElementById("add-output-button") as HTMLButtonElement,
    spawnReturnButton: document.getElementById("spawn-return-node-button") as HTMLButtonElement,
  },
  store,
  canvas,
  "output",
  getActiveFunction,
);

const localVariablesSection = document.getElementById("local-variables-section") as HTMLDivElement;
const localVariablePanel = createVariablePanel(
  {
    list: document.getElementById("local-variables-list") as HTMLDivElement,
    nameInput: document.getElementById("new-local-variable-name") as HTMLInputElement,
    typeSelect: document.getElementById("new-local-variable-type") as HTMLSelectElement,
    addButton: document.getElementById("add-local-variable-button") as HTMLButtonElement,
  },
  store,
  canvas,
  () => getActiveFunction()?.body ?? store.state.rootGraph,
);

backButton.addEventListener("click", () => {
  store.state.activeFunctionId = null;
  store.notify();
});

function render(): void {
  const { camera, selectedNodeIds, selectedCommentId, executingNodeId, firedConnectionIds, wireDrag } =
    store.state;
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
  drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId);
  widgetSync.sync(geometries);
  commentOverlay.sync();
  variablePanel.render();
  functionsPanel.render();
  inputsPanel.render();
  outputsPanel.render();

  const activeFn = getActiveFunction();
  localVariablesSection.style.display = activeFn ? "" : "none";
  if (activeFn) localVariablePanel.render();
  backButton.style.display = activeFn ? "" : "none";
  breadcrumb.textContent = activeFn ? `Editing function: ${activeFn.name}` : "";
}

store.subscribe(render);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/** Creates a node at worldPos and, if an anchor pin is given, auto-connects it to the first compatible pin. */
function createNodeAndMaybeConnect(
  def: NodeDef,
  worldPos: { x: number; y: number },
  anchor?: WireAnchor,
): void {
  const graph = getEditingGraph(store.state);
  const node = createNodeInstance(def.type, worldPos, def.pins);
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

setupPointerInteraction(canvas, store, {
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
  const rect = canvas.getBoundingClientRect();
  const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

  const eventRoots = store.state.rootGraph.nodes.filter((n) => getNodeDef(n.type).eventTrigger);
  if (eventRoots.length === 0) {
    appendLog("No event nodes in graph — nothing to run.");
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
