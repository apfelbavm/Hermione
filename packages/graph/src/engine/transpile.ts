import type * as TS from "typescript";

// The `typescript` npm package's compiler API is several MB even minified — loaded lazily via a
// dynamic import on first actual use (saving a Code node script), not a static top-level import,
// so the rest of the app (everyone who never touches a Code node) never pays for it in the eager
// bundle. Cached in a module-level promise so repeated saves reuse the same load. Same discipline
// scriptEditor.ts already applies to `monaco-editor` itself, for the same reason.
let tsPromise: Promise<typeof TS> | null = null;

function loadTypescript(): Promise<typeof TS> {
  if (!tsPromise) tsPromise = import("typescript");
  return tsPromise;
}

/** Shared TS -> plain-JS transpile step for the Code node (see nodes/code.ts, CodeScriptDef in
 * types.ts). Deliberately `transpileModule` (a single-file, type-check-free strip-the-types pass),
 * not the full `ts.createProgram` compiler: a script here is always one self-contained file with no
 * imports to resolve, and running the full type checker would need a whole in-memory compiler host
 * for a browser environment that has no real filesystem — `transpileModule` needs none of that,
 * which is also exactly why plain JavaScript passes straight through unchanged (nothing to strip),
 * so this one function is what makes "write TypeScript, or just plain JS if that's simpler" work
 * for the same node type with no separate JS-only code path. */

export interface TranspileResult {
  success: boolean;
  /** Plain JS on success; empty string on failure. */
  outputJs: string;
  /** Human-readable diagnostic messages (syntax errors) — empty when success is true. */
  errors: string[];
}

/** Compiles a Code node script's TypeScript (or plain JavaScript — a no-op superset) source down to
 * plain JS text, ready to embed in a `new Function` call (interpreter) or directly in generated
 * output (compiler) — see nodes/code.ts. Only reports SYNTAX errors (unterminated strings, mismatched
 * braces, etc.); it does not type-check, so a script with real type errors but valid syntax still
 * transpiles "successfully" and only fails later, at actual call time, the same as plain JS would. */
export async function transpileScript(source: string): Promise<TranspileResult> {
  const ts = await loadTypescript();
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      removeComments: false,
    },
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics ?? []).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && d.start !== undefined) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      return `Line ${line + 1}, column ${character + 1}: ${message}`;
    }
    return message;
  });

  if (errors.length > 0) {
    return { success: false, outputJs: "", errors };
  }
  return { success: true, outputJs: result.outputText, errors: [] };
}
