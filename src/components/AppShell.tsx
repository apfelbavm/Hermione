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
import { drawMouseCoordinates } from "../render/drawHud";
import { drawNodes } from "../render/drawNodes";
import { drawWires, drawWireDragPreview } from "../render/drawWires";
import { drawMarqueeSelection } from "../render/drawMarquee";
import { createStore, getEditingGraph, getVisibleVariablesForState } from "../state/store";
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
      selectedNodeIds: new Set(),
      selectedCommentIds: new Set(),
      executingNodeId: null,
      firedConnectionIds: new Set(),
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
      drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId, variables, functions, scripts, latentNodeIds);
      if (marqueeSelection) drawMarqueeSelection(ctx, camera, marqueeSelection);
      drawMouseCoordinates(ctx, camera.screenToWorld(lastMouseScreenPos.x, lastMouseScreenPos.y), width, height);
      widgetSync.sync(geometries);
      commentOverlay.sync();
      nodeDescriptionOverlay.sync(geometries);
    }

    function render(): void {
      renderCanvas();
      scriptEditor.render();
      snapToGridCheckbox.checked = store.state.snapToGrid;
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
      const types = e.dataTransfer?.types;
      if (types?.includes(FUNCTION_DRAG_MIME) || types?.includes(VARIABLE_DRAG_MIME) || types?.includes(SCRIPT_DRAG_MIME)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }
    }
    canvas.addEventListener("dragover", onCanvasDragOver);

    function onCanvasDrop(e: DragEvent): void {
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

    async function onRunClick(): Promise<void> {
      activeSimulation?.abort();
      const controller = new AbortController();
      activeSimulation = controller;

      runButton.disabled = true;
      logPanel.innerHTML = "";
      store.state.firedConnectionIds = new Set();

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
            case "node-start":
              store.state.executingNodeId = (data as { nodeId: string }).nodeId;
              store.notify();
              break;
            case "exec-fire":
              store.state.firedConnectionIds.add((data as { connectionId: string }).connectionId);
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
          store.notify();
          runButton.disabled = false;
          activeSimulation = null;
        }
      }
    }
    runButton.addEventListener("click", onRunClick);

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
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
      unsubscribe();
      snapToGridCheckbox.removeEventListener("change", onSnapToGridChange);
      canvas.removeEventListener("contextmenu", onCanvasContextMenu);
      canvas.removeEventListener("dragover", onCanvasDragOver);
      canvas.removeEventListener("drop", onCanvasDrop);
      logClearButton.removeEventListener("click", onLogClear);
      runButton.removeEventListener("click", onRunClick);
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
