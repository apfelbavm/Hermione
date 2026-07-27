import { readFileSync, writeFileSync } from "node:fs";
import { registerBuiltins } from "../src/nodes";
import { compileGraph } from "../src/compiler/codegen";
import { deserializeGraph } from "../src/persistence/load";

function main(): void {
  const [graphPath, outPath] = process.argv.slice(2);
  if (!graphPath || !outPath) {
    console.error("Usage: npm run compile -- <graph.json> <outFile.js>");
    process.exit(1);
  }

  if (!outPath.endsWith(".mjs")) {
    console.warn(
      `Warning: output path "${outPath}" doesn't end in .mjs — a plain .js file is only ` +
        `treated as ESM by Node if a "type": "module" package.json is found above it. ` +
        `Use a .mjs extension for a file that runs correctly no matter where it's deployed.`,
    );
  }

  registerBuiltins();

  const json = readFileSync(graphPath, "utf8");
  const graph = deserializeGraph(json);
  const { code, manifest } = compileGraph(graph);

  writeFileSync(outPath, code, "utf8");

  console.log(`Compiled "${graph.name}" -> ${outPath}`);
  console.log("Triggers:");
  for (const trigger of manifest.triggers) {
    console.log(`  - ${trigger.functionName} (${trigger.kind})`, trigger.details);
  }
}

main();
