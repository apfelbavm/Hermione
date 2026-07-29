import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { getNodeDef } from "../engine/registry";
import { NodeInstance } from "../engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

describe("boolean.not", () => {
  const def = getNodeDef("boolean.not");

  it("inverts true to false", () => {
    expect(
      def.evaluate!({ node: {} as NodeInstance, inputs: { value: true }, ctx: {} as never }),
    ).toEqual({ result: false });
  });

  it("inverts false to true", () => {
    expect(
      def.evaluate!({ node: {} as NodeInstance, inputs: { value: false }, ctx: {} as never }),
    ).toEqual({ result: true });
  });

  it("compileEvaluate produces an expression that evaluates to the same result", () => {
    const expr = def.compileEvaluate!({
      node: {} as NodeInstance,
      inputs: { value: "true" },
      graph: {} as never,
    }).result;
    expect(eval(expr)).toBe(false);
  });
});
