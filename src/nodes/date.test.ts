import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { getNodeDef } from "../engine/registry";
import { NodeInstance } from "../engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

const EARLIER = new Date("2020-01-01T00:00:00.000Z");
const LATER = new Date("2020-01-02T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function evaluate(type: string, inputs: Record<string, unknown>) {
  return getNodeDef(type).evaluate!({
    node: {} as NodeInstance,
    inputs,
    ctx: {} as never,
  });
}

function compile(type: string, inputs: Record<string, string>) {
  return getNodeDef(type).compileEvaluate!({
    node: {} as NodeInstance,
    inputs,
    graph: {} as never,
  });
}

describe("date.fromString / date.fromNumber", () => {
  it("parses an ISO string into a Date", () => {
    const { result } = evaluate("date.fromString", { value: "2020-01-01T00:00:00.000Z" }) as {
      result: Date;
    };
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(EARLIER.getTime());
  });

  it("converts epoch milliseconds into a Date", () => {
    const { result } = evaluate("date.fromNumber", { value: ONE_DAY_MS }) as { result: Date };
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(ONE_DAY_MS);
  });

  it("compileEvaluate produces expressions that evaluate to the same result", () => {
    expect(eval(compile("date.fromString", { value: '"2020-01-02T00:00:00.000Z"' }).result).getTime()).toBe(
      LATER.getTime(),
    );
    expect(eval(compile("date.fromNumber", { value: "0" }).result).getTime()).toBe(0);
  });
});

describe("date.subtract", () => {
  it("returns the millisecond difference between two dates", () => {
    expect(evaluate("date.subtract", { a: LATER, b: EARLIER })).toEqual({ result: ONE_DAY_MS });
  });

  it("treats an unconnected (null, or an unset datetime-local widget's \"\") input as the epoch", () => {
    expect(evaluate("date.subtract", { a: new Date(ONE_DAY_MS), b: null })).toEqual({
      result: ONE_DAY_MS,
    });
    expect(evaluate("date.subtract", { a: new Date(ONE_DAY_MS), b: "" })).toEqual({
      result: ONE_DAY_MS,
    });
  });

  it("compileEvaluate matches evaluate", () => {
    const expr = compile("date.subtract", {
      a: `new Date(${LATER.getTime()})`,
      b: `new Date(${EARLIER.getTime()})`,
    }).result;
    expect(eval(expr)).toBe(ONE_DAY_MS);
  });

  it("accepts a raw datetime-local widget string (e.g. an unconnected literal date pin)", () => {
    const { result } = evaluate("date.subtract", {
      a: "2020-01-02T00:00",
      b: "2020-01-01T00:00",
    }) as { result: number };
    expect(result).toBe(ONE_DAY_MS);
  });
});

describe("date comparisons", () => {
  const cases: [string, boolean, boolean][] = [
    ["date.equal", false, true],
    ["date.unequal", true, false],
    ["date.greaterThan", true, false],
    ["date.greaterEqual", true, true],
    ["date.lessThan", false, false],
    ["date.lessEqual", false, true],
  ];

  for (const [type, laterVsEarlier, equalVsEqual] of cases) {
    it(`${type} evaluates A(later) vs B(earlier) and A(equal) vs B(equal)`, () => {
      expect(evaluate(type, { a: LATER, b: EARLIER })).toEqual({ result: laterVsEarlier });
      expect(evaluate(type, { a: EARLIER, b: new Date(EARLIER.getTime()) })).toEqual({
        result: equalVsEqual,
      });
    });

    it(`${type} compileEvaluate matches evaluate`, () => {
      const expr = compile(type, {
        a: `new Date(${LATER.getTime()})`,
        b: `new Date(${EARLIER.getTime()})`,
      }).result;
      expect(eval(expr)).toBe(laterVsEarlier);
    });
  }
});

describe("string.fromDate", () => {
  it("formats a Date as an ISO string", () => {
    expect(evaluate("string.fromDate", { value: EARLIER })).toEqual({
      result: "2020-01-01T00:00:00.000Z",
    });
  });

  it("compileEvaluate matches evaluate", () => {
    const expr = compile("string.fromDate", { value: `new Date(${EARLIER.getTime()})` }).result;
    expect(eval(expr)).toBe("2020-01-01T00:00:00.000Z");
  });
});
