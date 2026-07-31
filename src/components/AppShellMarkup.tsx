import type { FunctionDef } from "../engine/types";
import type { Store } from "../state/store";
import { useStoreRevision } from "../state/useStore";
import { DetailsPanel } from "./sidebar/DetailsPanel";
import { FunctionsPanel } from "./sidebar/FunctionsPanel";
import { GraphTabs } from "./sidebar/GraphTabs";
import { ScriptsPanel } from "./sidebar/ScriptsPanel";
import { VariablePanel } from "./sidebar/VariablePanel";

/** JSX port of the old index.html body markup — most sidebar panels are now real React components
 * (see ./sidebar/*); everything not yet converted (canvas overlays, Monaco, resizers) keeps the
 * same element ids the still-imperative AppShell.tsx mount effect looks up via
 * document.getElementById, exactly as it did when this was static HTML. */
export default function AppShellMarkup({ store }: { store: Store }) {
  useStoreRevision(store);

  const activeFunction: FunctionDef | null = store.state.activeFunctionId ? (store.state.rootGraph.functions.find((f) => f.id === store.state.activeFunctionId) ?? null) : null;

  return (
    <div id="app">
      <div id="toolbar">
        <div id="toolbar-left">
          <span id="toolbar-title">Hermione</span>
        </div>
        <div id="toolbar-center">
          <div id="simulation-controls" className="toolbar-button-group">
            <button id="run-button">Simulate ▶</button>
            <button id="pause-button" style={{ display: "none" }} title="Pause the running simulation">
              ⏸ Pause
            </button>
            <button id="continue-button" style={{ display: "none" }} title="Continue past the current breakpoint/pause">
              ▶ Continue
            </button>
            <button id="stop-button" style={{ display: "none" }} title="Stop the running simulation">
              ■ Stop
            </button>
            <label id="auto-pan-toggle" className="toolbar-toggle" title="Pan the camera to follow whichever node is currently executing during a Simulate run">
              <input type="checkbox" id="auto-pan-checkbox" />
              Auto Pan
            </label>
          </div>
        </div>
        <div id="toolbar-right">
          <button id="save-button">Save</button>
          <button id="load-button">Load</button>
          <button id="download-button">Download</button>
          <button id="compile-button">Compile</button>
          <button id="delete-button" title="Delete the saved graph (from local storage)">
            Delete
          </button>
          <input id="load-file-input" type="file" accept="application/json" style={{ display: "none" }} />
        </div>
      </div>
      <div id="main-area">
        <div id="left-sidebar" className="side-panel">
          <FunctionsPanel store={store} />
          <VariablePanel id="variables-section" title="Variables" store={store} getGraph={() => store.state.rootGraph} />
          <ScriptsPanel store={store} />
          {activeFunction && <VariablePanel id="local-variables-section" title="Local Variables" store={store} getGraph={() => activeFunction.body} />}
        </div>
        <div id="left-sidebar-resizer" className="resizer resizer-vertical" />
        <div id="canvas-column">
          <div id="graph-tabs">
            <GraphTabs store={store} />
          </div>
          <div id="canvas-container">
            <canvas id="graph-canvas" />
            <div id="overlay" />
            <div id="canvas-hud-toolbar">
              <label id="snap-to-grid-toggle" className="toolbar-toggle">
                <input type="checkbox" id="snap-to-grid-checkbox" />
                Snap to Grid
              </label>
              <button id="frame-all-button" className="canvas-hud-button" title="Fit graph to view">
                ⛶
              </button>
            </div>
          </div>
        </div>
        <div id="right-sidebar-resizer" className="resizer resizer-vertical" />
        <div id="right-sidebar" className="side-panel">
          <DetailsPanel store={store} />
        </div>
      </div>
      <div id="log-resizer" className="resizer resizer-horizontal" />
      <div id="log-container">
        <div id="log-tab-strip">
          <div id="log-tabs-dynamic" />
          <span id="log-save-status" className="log-save-status" style={{ display: "none" }} />
          <button id="log-save-button" className="log-clear-button" title="Save script" style={{ display: "none" }}>
            💾
          </button>
          <button id="log-clear-button" className="log-clear-button" title="Clear log">
            🗑
          </button>
        </div>
        <div id="log-panel" />
        <div id="monaco-container" style={{ display: "none" }} />
      </div>
    </div>
  );
}
