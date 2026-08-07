import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEPLOYED_SCRIPTS_DIR = path.join(process.cwd(), "data", "deployed-scripts");

/** Where a Flow's deployed compiled output actually lives on disk — DatabaseManager's own `code`
 * column is the source of truth, this is just where it gets materialized so it can actually be
 * `import()`ed (see api/emulate/run/route.ts). Deliberately under this project's own
 * directory tree (not the OS temp dir) so a bare-specifier import inside it — e.g.
 * "fast-xml-parser"/"papaparse", see NodeDef.compileImports — resolves against this app's own
 * already-installed node_modules the same way any other file in the repo would: Node's ESM resolver
 * walks UP from the importing file's own directory looking for a node_modules folder at each level,
 * so anywhere under the repo root works, but an OS temp directory (with no node_modules above it at
 * all) would fail to resolve those packages. */
export function deployedScriptPath(flowId: string): string {
  return path.join(DEPLOYED_SCRIPTS_DIR, `${flowId}.mjs`);
}

export function writeDeployedScriptFile(flowId: string, code: string): void {
  mkdirSync(DEPLOYED_SCRIPTS_DIR, { recursive: true });
  writeFileSync(deployedScriptPath(flowId), code, "utf8");
}

/** Cleans up the materialized file alongside DatabaseManager's own deployed_scripts row — deleting a
 * Flow/Project removes its DB row (see deleteFlow/deleteProject) but has no way to also touch the
 * filesystem itself, so the API routes that call those also call this. A no-op if nothing was ever
 * deployed for this flow (`force: true`). */
export function deleteDeployedScriptFile(flowId: string): void {
  rmSync(deployedScriptPath(flowId), { force: true });
}
