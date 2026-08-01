import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { getNodeDef } from "../../src/engine/registry";
import type { Variable } from "../../src/engine/types";

beforeAll(() => {
  registerBuiltins();
});

const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 7 };

describe("variable.get / variable.set pins are unlabeled — the node's title (see resolveNodeLabel) carries the name instead", () => {
  it("Get Variable's output pin has no label", () => {
    const def = getNodeDef("variable.get");
    const pins = def.derivePins!(variable);
    expect(pins.find((p) => p.id === "value")?.label).toBe("");
  });

  it("Set Variable's value pin has no label (its exec pins were already unlabeled)", () => {
    const def = getNodeDef("variable.set");
    const pins = def.derivePins!(variable);
    expect(pins.find((p) => p.id === "value")?.label).toBe("");
    expect(pins.find((p) => p.id === "exec-in")?.label).toBe("");
    expect(pins.find((p) => p.id === "exec-out")?.label).toBe("");
  });

  it("Get/Set still evaluate/execute using the variable's type and default correctly", () => {
    const getDef = getNodeDef("variable.get");
    const setDef = getNodeDef("variable.set");
    const valuePin = setDef.derivePins!(variable).find((p) => p.id === "value");
    expect(valuePin?.type).toBe("number");
    expect(valuePin?.defaultValue).toBe(7);
    expect(getDef.derivePins!(variable).find((p) => p.id === "value")?.type).toBe("number");
  });
});
