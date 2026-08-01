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
