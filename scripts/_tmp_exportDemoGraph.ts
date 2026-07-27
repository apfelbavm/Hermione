import { writeFileSync } from "node:fs";
import { registerBuiltins } from "../src/nodes";
import { buildDemoGraph } from "../src/demoGraph";
import { serializeGraph } from "../src/persistence/save";

registerBuiltins();
const graph = buildDemoGraph();
writeFileSync(process.argv[2], serializeGraph(graph), "utf8");
console.log("wrote", process.argv[2]);
