import { i18n } from "@i18n";
import type { FunctionDef } from "../engine/types";
import type { FlowVersionSummary } from "../server/models";
import type { Store } from "../state/store";
import { useStoreRevision } from "../state/useStore";
import { DetailsPanel } from "./sidebar/DetailsPanel";
import { FunctionsPanel } from "./sidebar/FunctionsPanel";
import { GraphTabs } from "./sidebar/GraphTabs";
import { PageHeader } from "./PageHeader";
import { ScriptsPanel } from "./sidebar/ScriptsPanel";
import { VariablePanel } from "./sidebar/VariablePanel";
import { VersionRestorePanel } from "./sidebar/VersionRestorePanel";
import { ThemeToggle } from "./ThemeToggle";
import { IconManager } from "../shared/iconManager";

export default function RestoreVersionMarkup({
  store,
  flowName,
  versions,
  selectedVersionId,
  onSelectVersion,
  onRestore,
  onCancel,
  loadingVersions,
  loadingGraph,
  restoring,
}: {
  store: Store;
  flowName: string;
  versions: FlowVersionSummary[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onRestore: () => void;
  onCancel: () => void;
  loadingVersions: boolean;
  loadingGraph: boolean;
  restoring: boolean;
}) {
  useStoreRevision(store);

  const activeFunction: FunctionDef | null = store.state.activeFunctionId ? (store.state.rootGraph.functions.find((f) => f.id === store.state.activeFunctionId) ?? null) : null;

  return (
    <div id="app">
      <PageHeader />
      <div id="toolbar">
        <div className="toolbar-left">
          <span id="toolbar-title">
            {i18n.pages.restore_flow_version.title}
            {flowName ? ` — ${flowName}` : ""}
          </span>
        </div>

        <VersionRestorePanel versions={versions} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} onRestore={onRestore} onCancel={onCancel} loadingVersions={loadingVersions} loadingGraph={loadingGraph} restoring={restoring} />
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
          <div id="canvas-container" className="canvas-container-locked">
            <canvas id="graph-canvas" />
            <div id="overlay" />
            <div id="canvas-hud-toolbar">
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
