import { transpileScript } from "../engine/transpile";
import type { CodeScriptDef } from "../engine/types";
import { closeScriptTab, type Store } from "../state/store";

export interface ScriptEditorElements {
  /** Where the Log tab + one tab per open script get rendered — a dedicated sub-container of
   * #log-tab-strip, NOT the whole strip: the Save/Clear buttons live in index.html as permanent,
   * never-recreated elements (main.ts holds a direct reference to #log-clear-button already), so
   * this module only ever owns the tabs themselves, never destroys/rebuilds its siblings. */
  tabsContainer: HTMLElement;
  logPanel: HTMLElement;
  monacoContainer: HTMLElement;
  saveButton: HTMLButtonElement;
  saveStatus: HTMLElement;
  clearButton: HTMLButtonElement;
}

// Monaco's own JS is multi-megabyte (a full language-service-backed editor) — loaded lazily via a
// dynamic import on first actual use (opening a script tab) rather than a static top-level import,
// so an app session that never touches a Code node never pays for it. Cached in a module-level
// promise so a second script tab (or switching back to one already open) reuses the same load
// instead of re-fetching. Loaded together with the two workers it needs (the generic editor worker,
// plus the TypeScript/JavaScript language worker for the "typescript" model language) — Monaco reads
// `self.MonacoEnvironment.getWorker` to know how to spin those up; the `?worker` import suffix is
// Vite's own convention for "bundle this as a Worker entry, give me a constructor," needing no extra
// vite.config.ts wiring.
let monacoPromise: Promise<typeof import("monaco-editor")> | null = null;

function loadMonaco(): Promise<typeof import("monaco-editor")> {
  if (!monacoPromise) {
    monacoPromise = Promise.all([
      import("monaco-editor"),
      // No "esm/vs/" prefix here — the package's own exports map (`"./*.js": "./esm/vs/*.js"`)
      // already adds that, so including it too would double it up and fail to resolve.
      import("monaco-editor/editor/editor.worker.js?worker"),
      import("monaco-editor/language/typescript/ts.worker.js?worker"),
    ]).then(([monaco, editorWorker, tsWorker]) => {
      (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
          if (label === "typescript" || label === "javascript") return new tsWorker.default();
          return new editorWorker.default();
        },
      };
      return monaco;
    });
  }
  return monacoPromise;
}

/** Manages the lower panel's tab strip (Log + one tab per open script) and the single shared Monaco
 * instance backing every script tab — one editor, whose `model` swaps per script (rather than one
 * editor instance per tab), each model cached by script id so switching tabs back and forth doesn't
 * lose the in-progress (unsaved) buffer or re-fetch/re-tokenize the source. A model's content is
 * seeded from CodeScriptDef.source only ONCE, at creation — never overwritten by a later render(),
 * exactly so an in-progress edit is never silently clobbered by the model existing already covers
 * "don't wipe out what the user is actively typing," the same concern detailsPanel.ts's own
 * `contains(document.activeElement)` guards handle for its plain-HTML fields. */
export function createScriptEditor(elements: ScriptEditorElements, store: Store): { render: () => void } {
  type Monaco = typeof import("monaco-editor");
  let monaco: Monaco | null = null;
  let editor: import("monaco-editor").editor.IStandaloneCodeEditor | null = null;
  const models = new Map<string, import("monaco-editor").editor.ITextModel>();
  let editorLoading = false;
  // The script id whose model the shared editor currently displays — null while showing the Log
  // tab (the editor is simply hidden then) or before Monaco has finished loading.
  let shownScriptId: string | null = null;

  function scriptById(id: string): CodeScriptDef | undefined {
    return store.state.rootGraph.scripts.find((s) => s.id === id);
  }

  function getOrCreateModel(script: CodeScriptDef): import("monaco-editor").editor.ITextModel {
    const existing = models.get(script.id);
    if (existing) return existing;
    // A unique-per-script fake path (not a real fetchable URL) — Monaco's TS language service uses
    // the model's URI as its module identity; without one it defaults to an in-memory scheme that
    // works fine for a single model but two DIFFERENT scripts would otherwise be indistinguishable.
    const uri = monaco!.Uri.parse(`file:///hermione-script-${script.id}.ts`);
    const model = monaco!.editor.createModel(script.source, "typescript", uri);
    models.set(script.id, model);
    return model;
  }

  function ensureEditorMounted(): void {
    if (editor || editorLoading || !monaco) return;
    editor = monaco.editor.create(elements.monacoContainer, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      theme: "vs-dark",
    });
  }

  function showSaveStatus(message: string, isError: boolean): void {
    elements.saveStatus.textContent = message;
    elements.saveStatus.classList.toggle("log-save-status-error", isError);
  }

  elements.saveButton.addEventListener("click", async () => {
    if (!shownScriptId || !editor) return;
    const script = scriptById(shownScriptId);
    if (!script) return;

    const source = editor.getValue();
    showSaveStatus("Saving…", false);
    const { success, outputJs, errors } = await transpileScript(source);
    // Re-check: the user may have switched tabs (or the script may have been deleted) while the
    // (lazy-loaded-on-first-use) transpiler was still loading.
    if (shownScriptId !== script.id || !scriptById(script.id)) return;

    script.source = source;
    if (success) {
      script.compiledJs = outputJs;
      showSaveStatus("Saved", false);
    } else {
      // Deliberately keep the PREVIOUS compiledJs on a failed transpile (see CodeScriptDef's own
      // comment) — a script with a syntax error mid-edit keeps running/compiling against its last
      // good version instead of silently going dead.
      showSaveStatus(`Not saved — ${errors[0]}`, true);
    }
    store.notify();
  });

  function renderTabs(): void {
    elements.tabsContainer.innerHTML = "";

    const logTab = document.createElement("div");
    logTab.className = "log-tab" + (store.state.activeLowerTabId === null ? " log-tab-active" : "");
    logTab.textContent = "Log";
    logTab.addEventListener("click", () => {
      store.state.activeLowerTabId = null;
      store.notify();
    });
    elements.tabsContainer.appendChild(logTab);

    for (const scriptId of store.state.openScriptTabs) {
      const script = scriptById(scriptId);
      if (!script) continue; // stale reference to a since-deleted script

      const tab = document.createElement("div");
      tab.className = "log-tab" + (store.state.activeLowerTabId === scriptId ? " log-tab-active" : "");

      const label = document.createElement("span");
      label.className = "log-tab-label";
      const model = models.get(scriptId);
      const unsaved = !!model && model.getValue() !== script.source;
      label.textContent = script.name + (unsaved ? " •" : "");
      label.addEventListener("click", () => {
        store.state.activeLowerTabId = scriptId;
        store.notify();
      });

      const closeBtn = document.createElement("button");
      closeBtn.className = "log-tab-close";
      closeBtn.textContent = "✕";
      closeBtn.title = "Close tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeScriptTab(store.state, scriptId);
        store.notify();
      });

      tab.append(label, closeBtn);
      elements.tabsContainer.appendChild(tab);
    }
  }

  function render(): void {
    renderTabs();

    const activeScriptId = store.state.activeLowerTabId;
    const activeScript = activeScriptId ? scriptById(activeScriptId) : undefined;

    // A tab whose script vanished (deleted elsewhere) or the Log tab itself — same "fall back to
    // the log view" behavior either way.
    if (!activeScript) {
      elements.logPanel.style.display = "";
      elements.monacoContainer.style.display = "none";
      elements.saveButton.style.display = "none";
      elements.saveStatus.style.display = "none";
      elements.clearButton.style.display = "";
      shownScriptId = null;
      return;
    }

    elements.logPanel.style.display = "none";
    elements.monacoContainer.style.display = "";
    elements.saveButton.style.display = "";
    elements.saveStatus.style.display = "";
    elements.clearButton.style.display = "none";

    if (!monaco && !editorLoading) {
      editorLoading = true;
      elements.monacoContainer.textContent = "Loading editor…";
      loadMonaco().then((loaded) => {
        monaco = loaded;
        editorLoading = false;
        elements.monacoContainer.textContent = "";
        ensureEditorMounted();
        store.notify(); // re-render now that the editor actually exists
      });
      return;
    }
    if (!editor) return; // still loading

    if (shownScriptId !== activeScript.id) {
      editor.setModel(getOrCreateModel(activeScript));
      shownScriptId = activeScript.id;
      showSaveStatus("", false);
    }
  }

  return { render };
}
