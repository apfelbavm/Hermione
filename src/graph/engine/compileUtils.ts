/** Indents each line by `spaces` spaces — used when a node's compileExecute nests another block's statements (if/else, loops). */
export function indent(lines: string[], spaces = 2): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((line) => pad + line);
}

/** Shared `delay` helper snippet — any latent node that just needs to wait can contribute this exact source under the name "delay", so the compiler dedupes it across the whole generated file instead of emitting near-duplicate helpers. */
export const DELAY_HELPER_SOURCE = "function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }";

/** A stable, valid-JS-identifier local variable name for a given node instance's compileExecute
 * result — shared by a node's own compileExecute (which declares it) and its compileExecuteOutputs
 * (which references it), so the two independently produce the exact same name for the same node
 * without needing to pass anything between them. Node ids aren't guaranteed to be valid identifiers
 * on their own (e.g. "node-10-ngq47l" contains hyphens). */
export function compileResultVar(nodeId: string): string {
  return `__result_${nodeId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/** Real ESM import of src/server/functionLibrary.ts, the single shared home for every node type's
 * actual runtime logic — every node's compileImports contributes this exact same string, so
 * codegen.ts's plain string-equality dedup collapses it to one import line for the whole compiled
 * file no matter how many distinct nodes/functions are used from it. The relative path assumes a
 * deployed script always lives at data/deployed-scripts/<flowId>.mjs (see server/deployedScriptFile.ts).
 * Resolving this at runtime with no separate build step requires the running Node process to have
 * NODE_OPTIONS=--experimental-strip-types set (see package.json's dev/start scripts). */
export const FUNCTION_LIBRARY_IMPORT = 'import * as functionLibrary from "../../src/server/functionLibrary.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibrarySftp.ts — kept in its own file
 * (and its own compileImports entry) rather than folded into functionLibrary.ts because it depends
 * on "ssh2-sftp-client", a package deliberately NOT installed for the interpreter/browser build (see
 * that file's own header comment) — no interpreter-facing code may ever import it directly. */
export const FUNCTION_LIBRARY_SFTP_IMPORT = 'import * as functionLibrarySftp from "../../src/server/functionLibrarySftp.ts";';
