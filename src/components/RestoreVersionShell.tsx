"use client";

import { useEffect, useState } from "react";
import { registerBuiltins } from "../graph/nodes";
import { isNodeLatent } from "../graph/engine/latency";
import { nextId } from "../graph/engine/graphMutations";
import { Graph } from "../graph/engine/graph";
import { Camera } from "../graph/render/camera";
import { computeAllNodeGeometries, computeNodeWorldRect } from "../graph/render/nodeGeometry";
import { drawComments } from "../graph/render/drawComments";
import { drawGrid } from "../graph/render/drawGrid";
import { drawReadOnlyLabel } from "../graph/render/drawHud";
import { drawNodes } from "../graph/render/drawNodes";
import { drawWires } from "../graph/render/drawWires";
import { drawMarqueeSelection } from "../graph/render/drawMarquee";
import { createStore, getEditingGraph, getVisibleVariablesForState } from "../state/store";
import { createHistoryManager } from "../state/history";
import { setupPointerInteraction } from "../graph/interaction/pointerHandlers";
import { ShortcutManager } from "../graph/interaction/shortcutManager";
import { createWidgetSync } from "../graph/overlay/widgetSync";
import { createNodeDescriptionOverlay } from "../graph/overlay/nodeDescriptionOverlay";
import { setupNodeHoverTooltip } from "../graph/overlay/nodeTooltip";
import { createCommentOverlay } from "../graph/overlay/commentOverlay";
import { useResizablePanels } from "./useResizablePanels";
import { createScriptEditor } from "../graph/overlay/scriptEditor";
import { deserializeGraph } from "../graph/persistence/load";
import { THEME_CHANGE_EVENT } from "../client/theme";
import { getFlowVersion, getFlowWithGraph, getProject, listFlowVersions, restoreFlowVersion } from "../client/api";
import type { FlowSummary, FlowVersionSummary, ProjectSummary } from "../server/models";
import RestoreVersionMarkup from "./RestoreVersionMarkup";

registerBuiltins();

/** Points the graph editing pipeline (rendering, selection, panning/zooming, Function/Script/
 * Monaco viewing) at a past Flow version — same building blocks AppShell.tsx wires up for live
 * editing, minus everything that only makes sense for the live Flow (Simulate, Save, Load,
 * Deploy): the whole store is `readOnly`, so pointerHandlers.ts/scriptEditor.ts/the sidebar panels
 * already refuse every mutation on their own; this component only ever needs to load a version's
 * graph into the canvas and let the user look at it. Deliberately not wrapped in PageShell (no
 * site header/footer/sidebar) — same bare "just the graph window" shape as the regular editor
 * page (see app/projects/[projectId]/flows/[flowId]/page.tsx). */
export default function RestoreVersionShell({ projectId, flowId }: { projectId: string; flowId: string }) {
  const [store] = useState(() =>
    createStore({
      rootGraph: new Graph(nextId("flow-graph"), ""),
      activeFunctionId: null,
      openFunctionTabs: [],
      openScriptTabs: [],
      activeLowerTabId: null,
      camera: new Camera(),
      snapToGrid: false,
      simulating: false,
      readOnly: true,
      paused: false,
      autoPan: false,
      selectedNodeIds: new Set(),
      selectedCommentIds: new Set(),
      executingNodeId: null,
      firedConnectionIds: new Set(),
      pinValues: new Map(),
      wireDrag: null,
      marqueeSelection: null,
      sidebarSelection: null,
      flowLoaded: true,
    }),
  );
  const [history] = useState(() => createHistoryManager(store));
  useResizablePanels();

  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [versions, setVersions] = useState<FlowVersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    void (async () => {
      const [proj, { flow: f }, versionList] = await Promise.all([getProject(projectId).catch(() => null), getFlowWithGraph(projectId, flowId), listFlowVersions(projectId, flowId)]);
      setProject(proj);
      setFlow(f);
      setVersions(versionList);
      setLoadingVersions(false);
      setSelectedVersionId(versionList[0]?.id ?? null);
    })();
  }, [projectId, flowId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let cancelled = false;
    setLoadingGraph(true);
    void (async () => {
      const version = await getFlowVersion(projectId, flowId, selectedVersionId).catch(() => null);
      if (cancelled) return;
      store.state.rootGraph = version?.graphJson ? deserializeGraph(version.graphJson) : new Graph(nextId("flow-graph"), "");
      store.state.activeFunctionId = null;
      store.state.openFunctionTabs = [];
      store.state.openScriptTabs = [];
      store.state.activeLowerTabId = null;
      store.state.sidebarSelection = null;
      store.state.selectedNodeIds = new Set();
      store.state.selectedCommentIds = new Set();
      store.notify();
      setLoadingGraph(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, projectId, flowId]);

  async function handleRestore(): Promise<void> {
    if (!selectedVersionId) return;
    setRestoring(true);
    try {
      await restoreFlowVersion(projectId, flowId, selectedVersionId);
      window.location.href = `/projects/${projectId}/flows/${flowId}`;
    } finally {
      setRestoring(false);
    }
  }

  function handleCancel(): void {
    window.location.href = `/projects/${projectId}`;
  }

  useEffect(() => {
    const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement;
    const container = document.getElementById("canvas-container") as HTMLDivElement;
    const mainArea = document.getElementById("main-area") as HTMLDivElement;
    const overlay = document.getElementById("overlay") as HTMLDivElement;
    const logPanel = document.getElementById("log-panel") as HTMLDivElement;
    const logClearButton = document.getElementById("log-clear-button") as HTMLButtonElement;
    const logTabsDynamic = document.getElementById("log-tabs-dynamic") as HTMLDivElement;
    const monacoContainer = document.getElementById("monaco-container") as HTMLDivElement;
    const logSaveButton = document.getElementById("log-save-button") as HTMLButtonElement;
    const logSaveStatus = document.getElementById("log-save-status") as HTMLSpanElement;
    const frameAllButton = document.getElementById("frame-all-button") as HTMLButtonElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    let canvasRedrawScheduled = false;
    function scheduleCanvasRedraw(): void {
      if (canvasRedrawScheduled) return;
      canvasRedrawScheduled = true;
      requestAnimationFrame(() => {
        canvasRedrawScheduled = false;
        renderCanvas();
      });
    }
    function onWindowMouseMove(): void {
      scheduleCanvasRedraw();
    }
    window.addEventListener("mousemove", onWindowMouseMove);

    function onThemeChange(): void {
      scheduleCanvasRedraw();
    }
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

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
      const latentNodeIds = new Set(graph.nodes.filter((n) => isNodeLatent(n, graph, store.state.rootGraph)).map((n) => n.id));
      drawNodes(ctx, graph, camera, geometries, selectedNodeIds, executingNodeId, variables, functions, scripts, latentNodeIds, false);
      if (marqueeSelection) drawMarqueeSelection(ctx, camera, marqueeSelection);
      drawReadOnlyLabel(ctx, width, height);
      widgetSync.sync(geometries);
      commentOverlay.sync();
      nodeDescriptionOverlay.sync(geometries);
      void wireDrag; // never set in read-only mode — kept for renderCanvas's shared shape with AppShell.tsx
    }

    function render(): void {
      renderCanvas();
      scriptEditor.render();
    }

    const unsubscribe = store.subscribe(render);
    window.addEventListener("resize", resizeCanvas);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    setupPointerInteraction(canvas, store, {
      // Wire-dragging is blocked at the source (readOnly, see pointerHandlers.ts) — this never fires.
      onWireDroppedInEmptySpace: () => {},
    });

    // readOnly already blocks every mutating shortcut (delete/undo/cut/paste/wrap-in-comment) at
    // the source — this only needs to scope select-all/copy to the graph canvas and its sidebars.
    const shortcutManager = new ShortcutManager(store, history, {
      scopeRoot: mainArea,
      getCursorScreenPos: () => ({ x: 0, y: 0 }), // paste/wrap-in-comment never reach the cursor in read-only mode
    });

    function onCanvasContextMenu(e: MouseEvent): void {
      // No mutating actions make sense on a read-only past version — suppress the node/wire/pin
      // context menu entirely rather than reimplementing a view-only subset of it.
      e.preventDefault();
    }
    canvas.addEventListener("contextmenu", onCanvasContextMenu);

    function onFrameAllClick(): void {
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
    }
    frameAllButton.addEventListener("click", onFrameAllClick);

    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      resizeObserver.disconnect();
      unsubscribe();
      canvas.removeEventListener("contextmenu", onCanvasContextMenu);
      frameAllButton.removeEventListener("click", onFrameAllClick);
      shortcutManager.dispose();
    };
  }, []);

  return (
    <RestoreVersionMarkup
      store={store}
      flowName={flow?.name ?? project?.name ?? ""}
      versions={versions}
      selectedVersionId={selectedVersionId}
      onSelectVersion={setSelectedVersionId}
      onRestore={handleRestore}
      onCancel={handleCancel}
      loadingVersions={loadingVersions}
      loadingGraph={loadingGraph}
      restoring={restoring}
    />
  );
}
