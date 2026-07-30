/** Direct JSX port of the old index.html body markup — same element ids throughout, since the
 * ported main.ts wiring (see AppShell.tsx's mount effect) still looks these up via
 * document.getElementById, exactly as it did when this was static HTML. Splitting the markup out
 * from the wiring keeps AppShell.tsx focused on the effect body during the bridge period; the ids
 * here get replaced by real component boundaries during the overlay -> React sweep, not before. */
export default function AppShellMarkup() {
  return (
    <div id="app">
      <div id="toolbar">
        <span id="toolbar-title">Hermione</span>
        <button id="run-button">Simulate ▶</button>
        <button id="save-button">Save</button>
        <button id="load-button">Load</button>
        <button id="download-button">Download</button>
        <button id="compile-button">Compile</button>
        <button id="delete-button" title="Delete the saved graph (from local storage)">
          Delete
        </button>
        <input id="load-file-input" type="file" accept="application/json" style={{ display: "none" }} />
      </div>
      <div id="main-area">
        <div id="left-sidebar" className="side-panel">
          <div id="functions-section" className="panel-section">
            <div id="functions-header" className="panel-header">
              <span className="panel-header-title">Functions</span>
              <button id="add-function-button" className="panel-header-add">
                +
              </button>
            </div>
            <div className="panel-body">
              <div id="functions-list" className="panel-list" />
            </div>
          </div>
          <div id="variables-section" className="panel-section">
            <div id="variables-header" className="panel-header">
              <span className="panel-header-title">Variables</span>
              <button id="add-variable-button" className="panel-header-add">
                +
              </button>
            </div>
            <div className="panel-body">
              <div id="variables-list" className="panel-list" />
            </div>
          </div>
          <div id="scripts-section" className="panel-section">
            <div id="scripts-header" className="panel-header">
              <span className="panel-header-title">Scripts</span>
              <button id="add-script-button" className="panel-header-add">
                +
              </button>
            </div>
            <div className="panel-body">
              <div id="scripts-list" className="panel-list" />
            </div>
          </div>
          <div id="local-variables-section" className="panel-section">
            <div id="local-variables-header" className="panel-header">
              <span className="panel-header-title">Local Variables</span>
              <button id="add-local-variable-button" className="panel-header-add">
                +
              </button>
            </div>
            <div className="panel-body">
              <div id="local-variables-list" className="panel-list" />
            </div>
          </div>
        </div>
        <div id="left-sidebar-resizer" className="resizer resizer-vertical" />
        <div id="canvas-column">
          <div id="graph-tabs" />
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
          <div id="details-section">
            <div className="details-header">Details</div>
            <div id="variable-details" className="details-content">
              <div id="variable-details-name" className="details-item-name" />
              <div id="variable-details-fields" />
            </div>
            <div id="node-details" className="details-content">
              <div id="node-details-name" className="details-item-name" />
              <div id="node-details-fields" />
            </div>
            <div id="comment-details" className="details-content">
              <div className="details-item-name">Comment</div>
              <div id="comment-details-fields" />
            </div>
            <div id="function-details" className="details-content">
              <div id="function-details-fields" />
              <div id="inputs-section" className="panel-section">
                <div id="inputs-header" className="panel-header">
                  <span className="panel-header-title">Inputs</span>
                  <button id="add-input-button" className="panel-header-add">
                    +
                  </button>
                </div>
                <div className="panel-body">
                  <div id="inputs-list" className="panel-list" />
                </div>
              </div>
              <div id="outputs-section" className="panel-section">
                <div id="outputs-header" className="panel-header">
                  <span className="panel-header-title">Outputs</span>
                  <button id="add-output-button" className="panel-header-add">
                    +
                  </button>
                </div>
                <div className="panel-body">
                  <div id="outputs-list" className="panel-list" />
                </div>
              </div>
            </div>
            <div id="script-details" className="details-content">
              <div id="script-inputs-section" className="panel-section">
                <div id="script-inputs-header" className="panel-header">
                  <span className="panel-header-title">Inputs</span>
                  <button id="add-script-input-button" className="panel-header-add">
                    +
                  </button>
                </div>
                <div className="panel-body">
                  <div id="script-inputs-list" className="panel-list" />
                </div>
              </div>
              <div id="script-outputs-section" className="panel-section">
                <div id="script-outputs-header" className="panel-header">
                  <span className="panel-header-title">Outputs</span>
                  <button id="add-script-output-button" className="panel-header-add">
                    +
                  </button>
                </div>
                <div className="panel-body">
                  <div id="script-outputs-list" className="panel-list" />
                </div>
              </div>
            </div>
          </div>
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
