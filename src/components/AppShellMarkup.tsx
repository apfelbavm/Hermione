import { i18n } from "@i18n";
import type { FunctionDef } from "@hermione/graph/engine/types";
import type { Store } from "@hermione/graph/state/store";
import { useStoreRevision } from "@hermione/graph/state/useStore";
import { AiChatPanel } from "./ai/AiChatPanel";
import { DetailsPanel } from "./sidebar/DetailsPanel";
import { FunctionsPanel } from "./sidebar/FunctionsPanel";
import { GraphTabs } from "./sidebar/GraphTabs";
import { PageHeader } from "./PageHeader";
import { ScriptsPanel } from "./sidebar/ScriptsPanel";
import { VariablePanel } from "./sidebar/VariablePanel";
import { IconManager } from "../shared/iconManager";

export default function AppShellMarkup({ store, flowName, flowId }: { store: Store; flowName: string; flowId: string }) {
  useStoreRevision(store);

  const activeFunction: FunctionDef | null = store.state.activeFunctionId ? (store.state.rootGraph.functions.find((f) => f.id === store.state.activeFunctionId) ?? null) : null;

  return (
    <div id="app">
      <PageHeader centerText={flowName} />
      <div id="toolbar">
        <div className="toolbar-left">
          <button type="button" id="back-to-project-button" className="btn btn-ghost" title={i18n.components.app_shell_markup.back_title}>
            <IconManager.ChevronLeftIcon />
            {i18n.components.app_shell_markup.back}
          </button>
          <button id="undo-button" className="btn btn-ghost btn-icon" title={i18n.components.app_shell_markup.undo_title}>
            <IconManager.UndoIcon />
          </button>
          <button id="redo-button" className="btn btn-ghost btn-icon" title={i18n.components.app_shell_markup.redo_title}>
            <IconManager.RedoIcon />
          </button>
        </div>
        <div id="simulation-controls" className="toolbar-center">
          <button id="run-button" className="btn btn-green">
            {i18n.components.app_shell_markup.simulate}
          </button>
          <button id="pause-button" className="btn btn-gray" style={{ display: "none" }} title={i18n.components.app_shell_markup.pause_title}>
            {i18n.components.app_shell_markup.pause}
          </button>
          <button id="continue-button" className="btn btn-gray" style={{ display: "none" }} title={i18n.components.app_shell_markup.continue_title}>
            {i18n.components.app_shell_markup.continue}
          </button>
          <button id="stop-button" className="btn btn-gray" style={{ display: "none" }} title={i18n.components.app_shell_markup.stop_title}>
            {i18n.components.app_shell_markup.stop}
          </button>
          <label id="auto-pan-toggle" className="toolbar-toggle" title={i18n.components.app_shell_markup.auto_pan_title}>
            <input type="checkbox" id="auto-pan-checkbox" />
            {i18n.components.app_shell_markup.auto_pan}
          </label>
        </div>
        <div className="toolbar-right">
          <button id="deploy-button" className="btn btn-ghost">
            {i18n.components.app_shell_markup.deploy}
          </button>
          <button id="save-button" className="btn btn-ghost">
            {i18n.components.app_shell_markup.save}
          </button>
          <button id="load-button" className="btn btn-ghost">
            {i18n.components.app_shell_markup.load}
          </button>
          <button id="download-button" className="btn btn-ghost">
            {i18n.components.app_shell_markup.download_graph}
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
                {i18n.components.app_shell_markup.snap_to_grid}
              </label>
              <button id="frame-all-button" className="canvas-hud-button btn btn-outline btn-icon" title="Fit graph to view">
                ⛶
              </button>
            </div>
          </div>
        </div>
        <div id="right-sidebar-resizer" className="resizer resizer-vertical" />
        <div id="right-sidebar" className="side-panel">
          <DetailsPanel store={store} />
        </div>
        <div id="ai-chat-resizer" className="resizer resizer-vertical" />
        <div id="ai-chat-panel-container" className="side-panel">
          <AiChatPanel store={store} flowId={flowId} />
        </div>
      </div>
      <div id="log-resizer" className="resizer resizer-horizontal" />
      <div id="log-container">
        <div id="log-tab-strip">
          <div id="log-tabs-dynamic" />
          <span id="log-save-status" className="log-save-status" style={{ display: "none" }} />
          <button id="log-save-button" className="log-clear-button btn btn-outline btn-icon" title="Save script" style={{ display: "none" }}>
            <IconManager.SaveIcon />
          </button>
          <button id="log-clear-button" className="log-clear-button btn btn-outline btn-icon" title="Clear log">
            <IconManager.ClearIcon />
          </button>
        </div>
        <div id="log-panel" />
        <div id="monaco-container" style={{ display: "none" }} />
      </div>
    </div>
  );
}
