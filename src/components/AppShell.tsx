"use client";

import { useEffect, useState } from "react";
import { registerBuiltins } from "../nodes";
import { connectPins, insertRerouteOnConnection, removeInstancePin } from "../engine/graphMutations";
import { canCollapseSelectionToFunction, collapseSelectionToFunction } from "../engine/collapseToFunction";
import { connectionsTouchingPin } from "../engine/graphQueries";
import { allNodeDefs, findCompatibleNodeDefs, getNodeDef, isPinTypeCompatible, topLevelGroup } from "../engine/registry";
import type { CodeScriptDef, FunctionDef, NodeDef, Variable } from "../engine/types";
import { buildDemoGraph } from "../demoGraph";
import { Camera } from "../render/camera";
import { computeAllNodeGeometries, computeNodeWorldRect } from "../render/nodeGeometry";
import { hitTestNode, hitTestPin, hitTestWire } from "../render/hitTest";
import { drawComments } from "../render/drawComments";
import { drawGrid, snapPositionToGrid } from "../render/drawGrid";
import { drawMouseCoordinates, drawSimulatingLabel } from "../render/drawHud";
import { drawNodes } from "../render/drawNodes";
import { drawWires, drawWireDragPreview } from "../render/drawWires";
import { drawMarqueeSelection } from "../render/drawMarquee";
import { createStore, getEditingGraph, getVisibleVariablesForState, openFunctionTab } from "../state/store";
import { createHistoryManager } from "../state/history";
import { selectAllCommentBoxes, selectAllNodes, setupPointerInteraction, type WireAnchor } from "../interaction/pointerHandlers";
import { createWidgetSync } from "../overlay/widgetSync";
import { createNodeDescriptionOverlay } from "../overlay/nodeDescriptionOverlay";
import { setupNodeHoverTooltip } from "../overlay/nodeTooltip";
import { createCommentOverlay } from "../overlay/commentOverlay";
import { useResizablePanels } from "./useResizablePanels";
import { createScriptEditor } from "../overlay/scriptEditor";
import { openNodeSearchMenu } from "../overlay/nodeSearchMenu";
import { FUNCTION_DRAG_MIME, SCRIPT_DRAG_MIME, VARIABLE_DRAG_MIME } from "../overlay/dragTypes";
import { openRowContextMenu, type ContextMenuItem } from "../overlay/rowContextMenu";
import { nextAvailableName } from "../overlay/uniqueName";
import { loadGraphFromFile, loadGraphFromLocalStorage } from "../persistence/load";
import { deleteSavedGraph, downloadGraphAsFile, saveGraphToLocalStorage, serializeGraph } from "../persistence/save";
import { downloadCompiledGraph } from "../compiler/codegen";
import { isNodeLatent } from "../engine/latency";
import { NodeInstance } from "../engine/nodeInstance";
import AppShellMarkup from "./AppShellMarkup";

registerBuiltins();

/** Parses a `text/event-stream` body into individual `{event, data}` messages. `/api/simulate`
 * can't be read with the browser's `EventSource` (it doesn't support POST bodies), so the stream
 * is read and split by hand instead — SSE frames are separated by a blank line, with `event:`/
 * `data:` prefixed lines inside each frame. */
async function* readServerSentEvents(response: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice("event: ".length);
        else if (line.startsWith("data: ")) data = line.slice("data: ".length);
      }
      if (data) yield { event, data: JSON.parse(data) };
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Ports the old vanilla main.ts's wiring almost verbatim into a single mount effect — refs aren't
 * needed since the effect runs after AppShellMarkup has committed to the DOM, so the same
 * document.getElementById lookups main.ts always used still resolve correctly. The one behavioral
 * change from main.ts: the Run button (renamed "Simulate") no longer executes the graph in the
 * browser at all — it POSTs the graph to /api/simulate and drives the exact same
 * executingNodeId/firedConnectionIds/log state from the server's streamed events instead of a
 * local ExecutionContext. See src/app/api/simulate/route.ts for the server side. */
export default function AppShell() {
  // Lazy-initialized once, on first client render — this component is only ever mounted client-side
  // (see app/page.tsx's ssr:false dynamic import), so it's safe to read localStorage here. Lives in
  // component state (not the mount effect below) so the React panel components in AppShellMarkup
  // can receive the same `store` instance synchronously on their very first render, instead of a
  // render pass with no store yet.
  const [store] = useState(() =>
    createStore({
      rootGraph: loadGraphFromLocalStorage() ?? buildDemoGraph(),
      activeFunctionId: null,
      openFunctionTabs: [],
      openScriptTabs: [],
      activeLowerTabId: null,
      camera: new Camera(),
      snapToGrid: true,
      simulating: false,
      paused: false,
      autoPan: true,
      selectedNodeIds: new Set(),
      selectedCommentIds: new Set(),
      executingNodeId: null,
      firedConnectionIds: new Set(),
      pinValues: new Map(),
      wireDrag: null,
      marqueeSelection: null,
      sidebarSelection: null,
    }),
  );
  const [history] = useState(() => createHistoryManager(store));
  useResizablePanels();

  useEffect(() => {
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
    const pauseButton = document.getElementById("pause-button") as HTMLButtonElement;
    const continueButton = document.getElementById("continue-button") as HTMLButtonElement;
    const stopButton = document.getElementById("stop-button") as HTMLButtonElement;
    const saveButton = document.getElementById("save-button") as HTMLButtonElement;
    const loadButton = document.getElementById("load-button") as HTMLButtonElement;
    const downloadButton = document.getElementById("download-button") as HTMLButtonElement;
    const compileButton = document.getElementById("compile-button") as HTMLButtonElement;
    const deleteButton = document.getElementById("delete-button") as HTMLButtonElement;
    const snapToGridCheckbox = document.getElementById("snap-to-grid-checkbox") as HTMLInputElement;
    const autoPanCheckbox = document.getElementById("auto-pan-checkbox") as HTMLInputElement;
    const frameAllButton = document.getElementById("frame-all-button") as HTMLButtonElement;
    const loadFileInput = document.getElementById("load-file-input") as HTMLInputElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    let lastMouseScreenPos = { x: 0, y: 0 };
    let canvasRedrawScheduled = false;
    function scheduleCanvasRedraw(): void {
      if (canvasRedrawScheduled) return;
      canvasRedrawScheduled = true;
      requestAnimationFrame(() => {
        canvasRedrawScheduled = false;
        renderCanvas();
      });
    }
    function onWindowMouseMove(e: MouseEvent): void {
      const rect = canvas.getBoundingClientRect();
      lastMouseScreenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      scheduleCanvasRedraw();
    }
    window.addEventListener("mousemove", onWindowMouseMove);

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

    function getActiveFunction(): FunctionDef | null {
      const id = store.state.activeFunctionId;
      if (!id) return null;
      return store.state.rootGraph.functions.find((f) => f.id === id) ?? null;
    }

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

    function renderCanvas(): void {
      const { camera, selectedNodeIds, selectedCommentIds, executingNodeId, firedConnectionIds, wireDrag, marqueeSelection } = store.state;
      const graph = getEditingGraph(store.state);
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const scripts = store.state.rootGraph.scripts;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      drawGrid(ctx, camera, width, height);
      drawComments(ctx, graph, camera, selectedCommentIds);
      const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);
      drawWires(ctx, graph, camera, geometries, firedConnectionIds, variables, functions, scripts);
      if (wireDrag) drawWireDragPreview(ctx, wireDrag);
      const latentNodeIds = new Set(graph.nodes.filter((n) => isNodeLatent(n, graph, store.state.rootGraph)).map((n) => n.id));
      drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId, variables, functions, scripts, latentNodeIds, store.state.simulating);
      if (marqueeSelection) drawMarqueeSelection(ctx, camera, marqueeSelection);
      if (store.state.simulating) drawSimulatingLabel(ctx, width, height);
      else drawMouseCoordinates(ctx, camera.screenToWorld(lastMouseScreenPos.x, lastMouseScreenPos.y), width, height);
      widgetSync.sync(geometries);
      commentOverlay.sync();
      nodeDescriptionOverlay.sync(geometries);
    }

    function render(): void {
      renderCanvas();
      scriptEditor.render();
      snapToGridCheckbox.checked = store.state.snapToGrid;
      autoPanCheckbox.checked = store.state.autoPan;

      // Every other toolbar control is disabled for the whole duration of a Simulate run — see
      // AppState.simulating. The run button itself is handled separately by onRunClick (it stays
      // enabled/disabled based on activeSimulation, not this flag, since aborting-and-restarting a
      // run is still allowed).
      const { simulating, paused } = store.state;
      saveButton.disabled = simulating;
      loadButton.disabled = simulating;
      downloadButton.disabled = simulating;
      compileButton.disabled = simulating;
      deleteButton.disabled = simulating;
      snapToGridCheckbox.disabled = simulating;
      frameAllButton.disabled = simulating;
      loadFileInput.disabled = simulating;

      // Pause/Continue only exist while a run is in progress — hidden the rest of the time — and
      // are each other's mirror image: Pause is only meaningful while actually running, Continue
      // only while stopped at a breakpoint/manual pause.
      pauseButton.style.display = simulating ? "" : "none";
      continueButton.style.display = simulating ? "" : "none";
      pauseButton.disabled = paused;
      continueButton.disabled = !paused;

      // Stop is the odd one out: it works whether the run is currently going or sitting paused, so
      // — unlike Pause/Continue — it's never itself disabled while visible.
      stopButton.style.display = simulating ? "" : "none";
    }

    const unsubscribe = store.subscribe(render);
    window.addEventListener("resize", resizeCanvas);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    function onSnapToGridChange(): void {
      store.state.snapToGrid = snapToGridCheckbox.checked;
      store.notify();
    }
    snapToGridCheckbox.addEventListener("change", onSnapToGridChange);

    function applySnapIfEnabled(worldPos: { x: number; y: number }): { x: number; y: number } {
      return store.state.snapToGrid ? snapPositionToGrid(worldPos) : worldPos;
    }

    function filterCreatableHere(defs: NodeDef[]): NodeDef[] {
      const graph = getEditingGraph(store.state);
      const isFunctionBody = store.state.activeFunctionId !== null;
      return defs.filter((def) => topLevelGroup(def.group) !== "Internal" && graph.canPlaceNodeType(def.type, isFunctionBody));
    }

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

    function onCanvasContextMenu(e: MouseEvent): void {
      e.preventDefault();
      if (store.state.simulating) return;
      if (pointerInteraction.shouldSuppressContextMenu()) return;
      const rect = canvas.getBoundingClientRect();
      const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

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

      const nodeHit = hitTestNode(graph, geometries, screenPos.x, screenPos.y);
      if (nodeHit) {
        const node = graph.nodes.find((n) => n.id === nodeHit.nodeId)!;

        if (!store.state.selectedNodeIds.has(node.id)) {
          store.state.selectedNodeIds = new Set([node.id]);
          store.state.selectedCommentIds = new Set();
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

        const selection = store.state.selectedNodeIds;
        items.push({
          label: "Collapse to Function",
          disabled: !canCollapseSelectionToFunction(store.state.rootGraph, graph, selection, variables, functions, scripts),
          onClick: () => {
            const name = nextAvailableName(
              store.state.rootGraph.functions.map((f) => f.name),
              "NewFunction",
            );
            const { callNodeId } = collapseSelectionToFunction(store.state.rootGraph, graph, selection, variables, functions, scripts, name);
            store.state.selectedNodeIds = new Set([callNodeId]);
            store.notify();
          },
        });

        if (node.canToggleDisabled(variables, functions, scripts)) {
          const isDisabled = !!node.disabled;
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

        // Reroute "knots" (see NodeDef.compact) are drawn far too small to host a breakpoint dot,
        // and don't meaningfully "execute" a step of their own — never offered a breakpoint toggle.
        if (!getNodeDef(node.type).compact) {
          items.push({
            label: node.breakpoint ? "Remove Breakpoint" : "Add Breakpoint",
            onClick: () => {
              node.breakpoint = !node.breakpoint;
              store.notify();
            },
          });
        }

        items.push({
          label: "Select All (Ctrl+A)",
          onClick: () => {
            store.state.selectedNodeIds = selectAllNodes(graph);
            store.state.selectedCommentIds = selectAllCommentBoxes(graph);
            store.notify();
          },
        });

        openRowContextMenu({ x: e.clientX, y: e.clientY }, items);
        store.notify();
        return;
      }

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
      const returnDef = activeFn ? getNodeDef("function.return") : undefined;

      openNodeSearchMenu(overlay, {
        screenPos,
        candidates: filterCreatableHere(allNodeDefs().filter((def) => !["Variables", "Functions", "Code"].includes(topLevelGroup(def.group)))),
        pinned: returnDef ? [returnDef] : undefined,
        onPick: (def) => {
          if (def.type === "function.return" && activeFn) spawnReturnNodeAt(activeFn, worldPos);
          else createNodeAndMaybeConnect(def, worldPos);
        },
        onCancel: () => {},
      });
    }
    canvas.addEventListener("contextmenu", onCanvasContextMenu);

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

    function spawnReturnNodeAt(fn: FunctionDef, worldPos: { x: number; y: number }): void {
      const def = getNodeDef("function.return");
      const pinDefs = def.deriveFunctionPins!(fn);
      const node = NodeInstance.createNodeInstance("function.return", applySnapIfEnabled(worldPos), pinDefs, undefined, undefined, fn.id);
      fn.body.addNode(node);
      store.notify();
    }

    function onCanvasDragOver(e: DragEvent): void {
      if (store.state.simulating) return;
      const types = e.dataTransfer?.types;
      if (types?.includes(FUNCTION_DRAG_MIME) || types?.includes(VARIABLE_DRAG_MIME) || types?.includes(SCRIPT_DRAG_MIME)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }
    }
    canvas.addEventListener("dragover", onCanvasDragOver);

    function onCanvasDrop(e: DragEvent): void {
      if (store.state.simulating) return;
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
          { label: "Get", onClick: () => spawnVariableNodeAt("variable.get", variable, worldPos) },
          { label: "Set", onClick: () => spawnVariableNodeAt("variable.set", variable, worldPos) },
        ]);
      }
    }
    canvas.addEventListener("drop", onCanvasDrop);

    // --- Simulate button: submits the current graph to the server (POST /api/simulate), which
    // executes every "On Run" root and streams back node-start/log/exec-fire/done events. The
    // browser applies those to the exact same store fields (executingNodeId/firedConnectionIds)
    // the old in-browser interpreter drove — no execution logic runs client-side anymore.
    function appendLog(message: string): void {
      const line = document.createElement("div");
      line.className = "log-line";
      line.textContent = message;
      logPanel.appendChild(line);
      logPanel.scrollTop = logPanel.scrollHeight;
    }

    function onLogClear(): void {
      logPanel.innerHTML = "";
    }
    logClearButton.addEventListener("click", onLogClear);

    let activeSimulation: AbortController | null = null;
    // The runId the currently-active simulation reported via its own "run-start" SSE event — null
    // before that arrives (right after the fetch starts) or once the run's ended. Needed so
    // onPauseClick/onContinueClick know which server-side run (see simulationControl.ts) to target.
    let currentRunId: string | null = null;

    /** Which function's body graph contains `nodeId`, or null if it's in the root graph (or the id
     * isn't found anywhere) — functions are never nested (see Graph.functions's own doc comment),
     * so this is at most one level deep. */
    function findOwningFunctionId(nodeId: string): string | null {
      if (store.state.rootGraph.nodes.some((n) => n.id === nodeId)) return null;
      const fn = store.state.rootGraph.functions.find((f) => f.body.nodes.some((n) => n.id === nodeId));
      return fn?.id ?? null;
    }

    // --- Auto-pan: while simulating (and the auto-pan HUD toggle is on), keeps whichever node is
    // currently executing centered in view by lerping the camera towards it every frame, rather
    // than snapping — a snap would be jarring for the fast node-to-node steps a simulation run does.
    const AUTO_PAN_LERP_PER_FRAME = 0.12;
    let panAnimationFrame: number | null = null;

    function panCameraTowardsNode(nodeId: string): void {
      if (panAnimationFrame !== null) cancelAnimationFrame(panAnimationFrame);

      function tick(): void {
        panAnimationFrame = null;
        if (!store.state.autoPan || store.state.executingNodeId !== nodeId) return;

        const variables = getVisibleVariablesForState(store.state);
        const functions = store.state.rootGraph.functions;
        const scripts = store.state.rootGraph.scripts;
        // The node-start handler above already switches to whichever tab contains this node, but
        // resolve independently (rather than trusting store.state.activeFunctionId) in case that
        // switch hasn't taken effect yet, or the user has since switched tabs away from it.
        const owningFunctionId = findOwningFunctionId(nodeId);
        const containingGraph = owningFunctionId ? store.state.rootGraph.functions.find((f) => f.id === owningFunctionId)?.body : store.state.rootGraph;
        const node = containingGraph?.nodes.find((n) => n.id === nodeId);
        if (!node || !containingGraph) return;

        const rect = computeNodeWorldRect(node, node.resolvePinDefs(variables, functions, scripts), variables, functions, scripts);
        const targetCenterX = rect.x + rect.width / 2;
        const targetCenterY = rect.y + rect.height / 2;
        const { camera } = store.state;
        const viewCenter = camera.screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
        const dx = targetCenterX - viewCenter.x;
        const dy = targetCenterY - viewCenter.y;

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          camera.x += dx * AUTO_PAN_LERP_PER_FRAME;
          camera.y += dy * AUTO_PAN_LERP_PER_FRAME;
          store.notify();
          panAnimationFrame = requestAnimationFrame(tick);
        }
      }
      panAnimationFrame = requestAnimationFrame(tick);
    }

    function onAutoPanChange(): void {
      store.state.autoPan = autoPanCheckbox.checked;
      store.notify();
    }
    autoPanCheckbox.addEventListener("change", onAutoPanChange);

    async function onRunClick(): Promise<void> {
      activeSimulation?.abort();
      const controller = new AbortController();
      activeSimulation = controller;

      runButton.disabled = true;
      store.state.simulating = true;
      store.state.paused = false;
      currentRunId = null;
      logPanel.innerHTML = "";
      store.state.firedConnectionIds = new Set();
      store.state.pinValues = new Map();

      // Commit any script tab's in-progress (unsaved) Monaco edits first — this IS the "submit"
      // step: the graph sent to the server is whatever's currently open for editing, flushed.
      await scriptEditor.flushDirtyScripts();

      try {
        const response = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serializeGraph(store.state.rootGraph),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => response.statusText);
          appendLog(`Simulation request failed: ${text}`);
          return;
        }

        for await (const { event, data } of readServerSentEvents(response)) {
          if (controller.signal.aborted) break;
          switch (event) {
            case "run-start":
              currentRunId = (data as { runId: string }).runId;
              break;
            case "node-start": {
              const nodeId = (data as { nodeId: string }).nodeId;
              store.state.executingNodeId = nodeId;

              // Follow execution across a function-call boundary — switches (opening if needed) to
              // whichever tab actually contains the node now running, root or function body alike,
              // so the canvas always shows the real step instead of silently doing nothing while a
              // called function's body runs off-tab.
              const owningFunctionId = findOwningFunctionId(nodeId);
              if (owningFunctionId !== store.state.activeFunctionId) {
                if (owningFunctionId) openFunctionTab(store.state, owningFunctionId);
                else store.state.activeFunctionId = null;
              }

              store.notify();
              if (store.state.autoPan) panCameraTowardsNode(nodeId);
              break;
            }
            case "exec-fire":
              store.state.firedConnectionIds.add((data as { connectionId: string }).connectionId);
              store.notify();
              break;
            case "pin-values": {
              const { nodeId, values } = data as { nodeId: string; values: Record<string, unknown> };
              for (const [pinId, value] of Object.entries(values)) {
                store.state.pinValues.set(`${nodeId}:${pinId}`, value);
              }
              store.notify();
              break;
            }
            case "paused":
              store.state.paused = true;
              store.notify();
              break;
            case "resumed":
              store.state.paused = false;
              store.notify();
              break;
            case "log":
              appendLog((data as { message: string }).message);
              break;
            case "done":
              break;
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          appendLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        if (activeSimulation === controller) {
          store.state.executingNodeId = null;
          store.state.simulating = false;
          store.state.paused = false;
          currentRunId = null;
          store.notify();
          runButton.disabled = false;
          activeSimulation = null;
          if (panAnimationFrame !== null) {
            cancelAnimationFrame(panAnimationFrame);
            panAnimationFrame = null;
          }
        }
      }
    }
    runButton.addEventListener("click", onRunClick);

    // --- Pause/Continue: POST to /api/simulate/control, targeting whichever runId the active
    // simulation reported (see "run-start" above) — the SSE stream itself has no way to receive
    // more input mid-flight, so this is a second, independent request (see that route's own
    // comment). The actual paused/resumed state only ever flips off the "paused"/"resumed" SSE
    // events the simulate stream sends back, not optimistically here, so it always reflects what
    // the server-side run is actually doing.
    async function postSimulationControl(action: "pause" | "resume"): Promise<void> {
      if (!currentRunId) return;
      await fetch("/api/simulate/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: currentRunId, action }),
      }).catch(() => {}); // best-effort — the run may have already ended just as this was sent
    }
    function onPauseClick(): void {
      void postSimulationControl("pause");
    }
    function onContinueClick(): void {
      void postSimulationControl("resume");
    }
    pauseButton.addEventListener("click", onPauseClick);
    continueButton.addEventListener("click", onContinueClick);

    // --- Stop: aborts the in-flight fetch outright (same AbortController onRunClick itself aborts
    // when Simulate is clicked again mid-run) — the request.signal "abort" listener on the server
    // (see route.ts) wakes anything paused so it can notice and unwind, and onRunClick's own
    // try/catch/finally resets simulating/executingNodeId/paused and re-enables the Simulate button,
    // exactly as if the run had ended on its own.
    function onStopClick(): void {
      activeSimulation?.abort();
    }
    stopButton.addEventListener("click", onStopClick);

    // --- Save / Load: JSON persisted to localStorage (auto-restored on next launch); Download hands
    // that same JSON out as a file, as a separate, explicit action ---
    async function onSaveClick(): Promise<void> {
      await scriptEditor.flushDirtyScripts();
      saveGraphToLocalStorage(store.state.rootGraph);
    }
    saveButton.addEventListener("click", onSaveClick);

    function onLoadClick(): void {
      loadFileInput.click();
    }
    loadButton.addEventListener("click", onLoadClick);

    async function onDownloadClick(): Promise<void> {
      await scriptEditor.flushDirtyScripts();
      downloadGraphAsFile(store.state.rootGraph);
    }
    downloadButton.addEventListener("click", onDownloadClick);

    async function onLoadFileChange(): Promise<void> {
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
        store.state.selectedCommentIds = new Set();
        store.state.executingNodeId = null;
        store.state.firedConnectionIds = new Set();
        store.state.pinValues = new Map();
        saveGraphToLocalStorage(graph);
        store.notify();
      } catch (err) {
        appendLog(`Failed to load graph: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    loadFileInput.addEventListener("change", onLoadFileChange);

    // --- Compile: generates a self-contained .mjs from the graph (see src/compiler/codegen.ts) and downloads it ---
    async function onCompileClick(): Promise<void> {
      await scriptEditor.flushDirtyScripts();
      try {
        downloadCompiledGraph(store.state.rootGraph);
      } catch (err) {
        appendLog(`Compile error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    compileButton.addEventListener("click", onCompileClick);

    function onDeleteClick(): void {
      deleteSavedGraph();
      location.reload();
    }
    deleteButton.addEventListener("click", onDeleteClick);

    function onFrameAllClick(): void {
      const graph = getEditingGraph(store.state);
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const scripts = store.state.rootGraph.scripts;

      const rects = [...graph.nodes.map((n) => computeNodeWorldRect(n, n.resolvePinDefs(variables, functions, scripts), variables, functions, scripts)), ...graph.commentBoxes.map((b) => ({ x: b.position.x, y: b.position.y, width: b.size.width, height: b.size.height }))];
      if (rects.length === 0) return;

      const minX = Math.min(...rects.map((r) => r.x));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxX = Math.max(...rects.map((r) => r.x + r.width));
      const maxY = Math.max(...rects.map((r) => r.y + r.height));

      store.state.camera.frameRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, canvas.clientWidth, canvas.clientHeight);
      store.notify();
    }
    frameAllButton.addEventListener("click", onFrameAllClick);

    return () => {
      activeSimulation?.abort();
      if (panAnimationFrame !== null) cancelAnimationFrame(panAnimationFrame);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
      unsubscribe();
      snapToGridCheckbox.removeEventListener("change", onSnapToGridChange);
      autoPanCheckbox.removeEventListener("change", onAutoPanChange);
      canvas.removeEventListener("contextmenu", onCanvasContextMenu);
      canvas.removeEventListener("dragover", onCanvasDragOver);
      canvas.removeEventListener("drop", onCanvasDrop);
      logClearButton.removeEventListener("click", onLogClear);
      runButton.removeEventListener("click", onRunClick);
      pauseButton.removeEventListener("click", onPauseClick);
      continueButton.removeEventListener("click", onContinueClick);
      stopButton.removeEventListener("click", onStopClick);
      saveButton.removeEventListener("click", onSaveClick);
      loadButton.removeEventListener("click", onLoadClick);
      downloadButton.removeEventListener("click", onDownloadClick);
      loadFileInput.removeEventListener("change", onLoadFileChange);
      compileButton.removeEventListener("click", onCompileClick);
      deleteButton.removeEventListener("click", onDeleteClick);
      frameAllButton.removeEventListener("click", onFrameAllClick);
    };
  }, []);

  return <AppShellMarkup store={store} />;
}
