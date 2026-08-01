import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { getNodeDef } from "../../src/engine/registry";

beforeAll(() => {
  registerBuiltins();
});

describe("auth.basic", () => {
  it("evaluate() produces a { header, value } Authorization object, base64-encoding user:pass", () => {
    const def = getNodeDef("auth.basic");
    const result = def.evaluate!({
      node: {} as any,
      inputs: { username: "user", password: "pass" },
      ctx: {} as any,
    });
    expect(result).toEqual({
      auth: { header: "Authorization", value: `Basic ${btoa("user:pass")}` },
    });
  });

  it("compileEvaluate() emits an expression that evaluates to the same shape at runtime", () => {
    const def = getNodeDef("auth.basic");
    const { auth } = def.compileEvaluate!({
      node: {} as any,
      inputs: { username: JSON.stringify("user"), password: JSON.stringify("pass") },
      graph: {} as any,
    });

    // eslint-disable-next-line no-new-func
    const value = new Function("btoa", `return (${auth});`)(btoa);
    expect(value).toEqual({ header: "Authorization", value: `Basic ${btoa("user:pass")}` });
  });

  it("has no exec pins — it's a pure value-producing node, not an action", () => {
    const def = getNodeDef("auth.basic");
    expect(def.pins.some((p) => p.type === "exec")).toBe(false);
  });
});
