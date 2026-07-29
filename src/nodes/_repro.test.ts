import { describe, expect, it, beforeAll } from "vitest";
import { registerBuiltins } from "./index";
import { transpileScript } from "../engine/transpile";
import { createTemplatedCodeScriptDef } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { NodeInstance } from "../engine/nodeInstance";
import type { ExecutionContext } from "../engine/types";

beforeAll(() => { registerBuiltins(); });

describe("repro", () => {
  it("editing then transpiling produces NEW compiledJs, not the template's", async () => {
    const script = createTemplatedCodeScriptDef("Test");
    const oldCompiled = script.compiledJs;
    const newSource = `function run(log, inputs) { log("EDITED: " + inputs.CustomMyInputPin); return { CustomMyOutputPin: "CHANGED" }; }`;
    const { success, outputJs, errors } = await transpileScript(newSource);
    console.log("success", success, "errors", errors);
    console.log("outputJs", JSON.stringify(outputJs));
    expect(success).toBe(true);
    expect(outputJs).not.toBe(oldCompiled);

    script.source = newSource;
    script.compiledJs = outputJs;

    const def = getNodeDef("code.run");
    const node = NodeInstance.createNodeInstance("code.run", {x:0,y:0}, def.deriveScriptPins!(script), "n1", undefined, undefined, script.id);
    const logs: string[] = [];
    const ctx = { log: (m: string) => logs.push(m), rootGraph: { scripts: [script] } } as unknown as ExecutionContext;
    const inputPinId = script.inputs[0].id;
    const outputPinId = script.outputs[0].id;
    const result = await def.execute!({ node, inputs: { [inputPinId]: "Hello World!" }, ctx });
    console.log("logs", logs, "outputs", result.outputs);
    expect(logs).toEqual(["EDITED: Hello World!"]);
    expect(result.outputs).toEqual({ [outputPinId]: "CHANGED" });
  });
});
