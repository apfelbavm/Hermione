import { transpileScript } from "../engine/transpile";
import type { CodeScriptDef } from "../engine/types";
import type { Graph } from "../engine/graph";
import { closeScriptTab, type Store } from "../state/store";

export interface ScriptEditor {
  render: () => void;
  /** Commits every open tab's IN-PROGRESS (unsaved) Monaco buffer into its CodeScriptDef — exactly
   * what clicking this panel's own Save button does, just for every dirty tab at once instead of
   * only whichever one is currently shown. Awaited by main.ts's toolbar Save/Compile/Run handlers
   * before they read graph.scripts, so none of them silently act on a script's STALE last-saved
   * text just because the user edited it without separately remembering to click this editor's own
   * small Save button first — easy to miss when there are two differently-scoped "Save" buttons on
   * screen (this one saves just the current script; the toolbar's saves the whole graph). Without
   * this, Save/Compile/Run all read straight from CodeScriptDef.compiledJs, which only ever updates
   * via this panel's own Save button — so an edit made and never explicitly (re-)saved here would
   * silently keep compiling/running/persisting whatever was last actually saved, no matter how much
   * more editing happened on top of it. */
  flushDirtyScripts: () => Promise<void>;
}

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
// instead of re-fetching.
//
// Loading goes through @monaco-editor/react's `loader` (backed by @monaco-editor/loader) rather
// than importing "monaco-editor" + its workers directly with Vite's `?worker` suffix: that suffix
// was Vite-specific and doesn't resolve under Next.js's webpack-based bundler. `loader` instead
// fetches Monaco (and wires up its worker environment, including the TypeScript/JavaScript
// language worker) from a CDN at runtime — no bundler-specific worker config needed, which matters
// most for a tool like this one that's meant to run under plain `next dev` on localhost with
// minimal build-tooling surface area.
let monacoPromise: Promise<typeof import("monaco-editor")> | null = null;

function loadMonaco(): Promise<typeof import("monaco-editor")> {
  if (!monacoPromise) {
    monacoPromise = import("@monaco-editor/react").then(({ loader }) => loader.init());
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
export function createScriptEditor(elements: ScriptEditorElements, store: Store): ScriptEditor {
  type Monaco = typeof import("monaco-editor");
  let monaco: Monaco | null = null;
  let editor: import("monaco-editor").editor.IStandaloneCodeEditor | null = null;
  const models = new Map<string, import("monaco-editor").editor.ITextModel>();
  let editorLoading = false;
  // The script id whose model the shared editor currently displays — null while showing the Log
  // tab (the editor is simply hidden then) or before Monaco has finished loading.
  let shownScriptId: string | null = null;
  // Which rootGraph `models` was built against — main.ts's "Load" flow (the only place that
  // reassigns store.state.rootGraph wholesale) already resets openScriptTabs/activeLowerTabId, but
  // never touches THIS module's own per-script model cache. Loading a file whose script(s) reuse an
  // id from before (e.g. re-loading a graph saved earlier this same session) would otherwise make
  // getOrCreateModel below hand back the OLD model — seeded from the PREVIOUS script.source, quite
  // possibly with unrelated in-progress (dirty) edits still sitting in it — instead of a fresh one
  // matching what was actually just loaded. render() below clears the whole cache the instant it
  // notices the graph itself has been swapped out, not just its contents mutated in place.
  let modelsRootGraph: Graph | null = null;

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

  /** Transpiles `source` and commits it into `script` — the one place that actually writes
   * CodeScriptDef.source/compiledJs, shared by the Save button below and flushDirtyScripts so
   * there's exactly one implementation of "what saving a script means" to keep in sync. */
  async function commitScriptSource(
    script: CodeScriptDef,
    source: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { success, outputJs, errors } = await transpileScript(source);
    script.source = source;
    if (success) {
      script.compiledJs = outputJs;
      return { success: true };
    }
    // Deliberately keep the PREVIOUS compiledJs on a failed transpile (see CodeScriptDef's own
    // comment) — a script with a syntax error mid-edit keeps running/compiling against its last
    // good version instead of silently going dead.
    return { success: false, error: errors[0] };
  }

  elements.saveButton.addEventListener("click", async () => {
    if (!shownScriptId || !editor) return;
    const script = scriptById(shownScriptId);
    if (!script) return;

    const source = editor.getValue();
    showSaveStatus("Saving…", false);
    const result = await commitScriptSource(script, source);
    // Re-check: the user may have switched tabs (or the script may have been deleted) while the
    // (lazy-loaded-on-first-use) transpiler was still loading.
    if (shownScriptId !== script.id || !scriptById(script.id)) return;

    showSaveStatus(result.success ? "Saved" : `Not saved — ${result.error}`, !result.success);
    store.notify();
  });

  async function flushDirtyScripts(): Promise<void> {
    const dirty = [...models.entries()]
      .map(([id, model]) => ({ script: scriptById(id), model }))
      .filter(
        (entry): entry is { script: CodeScriptDef; model: import("monaco-editor").editor.ITextModel } =>
          !!entry.script && entry.model.getValue() !== entry.script.source,
      );
    if (dirty.length === 0) return;

    await Promise.all(dirty.map(({ script, model }) => commitScriptSource(script, model.getValue())));

    if (shownScriptId && dirty.some((d) => d.script.id === shownScriptId)) {
      showSaveStatus("Saved", false);
    }
    store.notify();
  }

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
    if (store.state.rootGraph !== modelsRootGraph) {
      modelsRootGraph = store.state.rootGraph;
      editor?.setModel(null); // detach before disposing — Monaco errors if a disposed model stays set
      for (const model of models.values()) model.dispose();
      models.clear();
      shownScriptId = null;
    }

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

  return { render, flushDirtyScripts };
}
