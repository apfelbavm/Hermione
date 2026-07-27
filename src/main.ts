import "./style.css";
import { registerBuiltins } from "./nodes";
import { createExecutionContext, runExecFrom } from "./engine/executor";
import { addNode, connectPins, createNodeInstance } from "./engine/graphMutations";
import { allNodeDefs, findCompatibleNodeDefs, isPinTypeCompatible } from "./engine/registry";
import type { NodeDef } from "./engine/types";
import { buildDemoGraph } from "./demoGraph";
import { createCamera, screenToWorld } from "./render/camera";
import { computeAllNodeGeometries } from "./render/nodeGeometry";
import { drawComments } from "./render/drawComments";
import { drawGrid } from "./render/drawGrid";
import { drawNodes } from "./render/drawNodes";
import { drawWires, drawWireDragPreview } from "./render/drawWires";
import { createStore } from "./state/store";
import { setupPointerInteraction, type WireAnchor } from "./interaction/pointerHandlers";
import { createWidgetSync } from "./overlay/widgetSync";
import { createCommentOverlay } from "./overlay/commentOverlay";
import { createVariablePanel } from "./overlay/variablePanel";
import { openNodeSearchMenu } from "./overlay/nodeSearchMenu";
import { loadGraphFromFile, loadGraphFromLocalStorage } from "./persistence/load";
import { downloadGraphAsFile, saveGraphToLocalStorage } from "./persistence/save";

registerBuiltins();

const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement;
const container = document.getElementById("canvas-container") as HTMLDivElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const logPanel = document.getElementById("log-panel") as HTMLDivElement;
const runButton = document.getElementById("run-button") as HTMLButtonElement;
const saveButton = document.getElementById("save-button") as HTMLButtonElement;
const loadButton = document.getElementById("load-button") as HTMLButtonElement;
const loadFileInput = document.getElementById("load-file-input") as HTMLInputElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
if (!ctx) throw new Error("Canvas 2D context unavailable");

const store = createStore({
  graph: loadGraphFromLocalStorage() ?? buildDemoGraph(),
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
);

function render(): void {
  const {
    graph,
    camera,
    selectedNodeIds,
    selectedCommentId,
    executingNodeId,
    firedConnectionIds,
    wireDrag,
  } = store.state;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  drawGrid(ctx, camera, width, height);
  drawComments(ctx, graph, camera, selectedCommentId);
  const geometries = computeAllNodeGeometries(graph, camera);
  drawWires(ctx, graph, camera, geometries, firedConnectionIds);
  if (wireDrag) drawWireDragPreview(ctx, wireDrag);
  drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId);
  widgetSync.sync(geometries);
  commentOverlay.sync();
  variablePanel.render();
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
  const node = createNodeInstance(def.type, worldPos, def.pins);
  addNode(store.state.graph, node);

  if (anchor) {
    const wantDirection = anchor.pin.direction === "output" ? "input" : "output";
    const matchPin = def.pins.find(
      (p) => p.direction === wantDirection && isPinTypeCompatible(anchor.pin.type, p.type),
    );
    if (matchPin) {
      const anchorIsOutput = anchor.pin.direction === "output";
      const outputEnd = anchorIsOutput ? anchor : { nodeId: node.id, pinId: matchPin.id };
      const inputEnd = anchorIsOutput ? { nodeId: node.id, pinId: matchPin.id } : anchor;
      connectPins(store.state.graph, {
        fromNode: outputEnd.nodeId,
        fromPin: outputEnd.pinId,
        toNode: inputEnd.nodeId,
        toPin: inputEnd.pinId,
      });
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
    // Get/Set Variable nodes need a variable bound via the Variables panel — not generically creatable here.
    candidates: allNodeDefs().filter((def) => def.category !== "Variables"),
    onPick: (def) => createNodeAndMaybeConnect(def, worldPos),
    onCancel: () => {},
  });
});

// --- Run button: walks the exec chain, live-highlighting nodes/wires and logging Print output ---
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

  const startNode = store.state.graph.nodes.find((n) => n.type === "event.start");
  if (!startNode) {
    appendLog("No event.start node in graph — nothing to run.");
    runButton.disabled = false;
    return;
  }

  const execCtx = createExecutionContext(store.state.graph, {
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
    await runExecFrom(startNode.id, "exec-out", execCtx);
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
  saveGraphToLocalStorage(store.state.graph);
  downloadGraphAsFile(store.state.graph);
});

loadButton.addEventListener("click", () => loadFileInput.click());

loadFileInput.addEventListener("change", async () => {
  const file = loadFileInput.files?.[0];
  loadFileInput.value = "";
  if (!file) return;

  try {
    const graph = await loadGraphFromFile(file);
    store.state.graph = graph;
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
