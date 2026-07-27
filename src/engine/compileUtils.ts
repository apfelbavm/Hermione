/** Indents each line by `spaces` spaces — used when a node's compileExecute nests another block's statements (if/else, loops). */
export function indent(lines: string[], spaces = 2): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((line) => pad + line);
}

/** Shared `delay` helper snippet — any latent node that just needs to wait can contribute this exact source under the name "delay", so the compiler dedupes it across the whole generated file instead of emitting near-duplicate helpers. */
export const DELAY_HELPER_SOURCE =
  "function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }";
