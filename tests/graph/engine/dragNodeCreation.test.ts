import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { registerStructType } from "@hermione/graph/engine/structRegistry";
import { findDragCompatibleNodeDefs, resolveDragMatch } from "@hermione/graph/engine/dragNodeCreation";

beforeAll(() => {
  registerBuiltins();
  registerStructType({
    id: "dragTest.Player",
    label: "Player",
    fields: [{ id: "name", label: "Name", type: "string", defaultValue: "" }],
  });
});

describe("findDragCompatibleNodeDefs", () => {
  it("surfaces Array/Set/Map operations for a dragged container pin, not just fixed-type nodes", () => {
    const defs = findDragCompatibleNodeDefs({ type: "boolean", container: "array" }, "output");
    const types = defs.map((d) => d.type);
    expect(types).toContain("array.length");
    expect(types).toContain("array.forEach");
  });

  it("surfaces Struct Make/Break for a dragged struct pin of any registered class", () => {
    const defs = findDragCompatibleNodeDefs({ type: "struct", subType: "dragTest.Player" }, "output");
    const types = defs.map((d) => d.type);
    expect(types).toContain("struct.break");
  });

  it("does not surface Array operations for a plain scalar output that has no array counterpart context", () => {
    const defs = findDragCompatibleNodeDefs({ type: "boolean" }, "output");
    const types = defs.map((d) => d.type);
    // A bare scalar boolean can still feed an Array Add's "item" input (element role) — that's
    // exactly the wildcard behavior being tested elsewhere — but it must NOT match array.length's
    // "array" (container) input, since that pin's container is "array", not "single".
    expect(types).not.toContain("array.length");
    expect(types).toContain("array.add");
  });
});

describe("resolveDragMatch", () => {
  it("configures array.length's elementType to the dragged container pin's type", () => {
    const def = getNodeDef("array.length");
    const match = resolveDragMatch(def, { type: "string", container: "array" }, "input");
    expect(match).not.toBeNull();
    expect(match?.config.elementType).toBe("string");
    expect(match?.matchPin.container).toBe("array");
  });

  it("configures struct.break's subType to the dragged struct pin's exact class", () => {
    const def = getNodeDef("struct.break");
    const match = resolveDragMatch(def, { type: "struct", subType: "dragTest.Player" }, "input");
    expect(match).not.toBeNull();
    expect(match?.config.subType).toBe("dragTest.Player");
    expect(match?.matchPin.subType).toBe("dragTest.Player");
  });

  it("configures array.add's elementType to a dragged single scalar value (the 'item' role)", () => {
    const def = getNodeDef("array.add");
    const match = resolveDragMatch(def, { type: "boolean" }, "input");
    expect(match).not.toBeNull();
    expect(match?.config.elementType).toBe("boolean");
    expect(match?.matchPin.id).toBe("item");
  });

  it("configures map.set's key or value slot to a dragged single scalar value", () => {
    // map.set has two single-scalar input slots ("key"/"value") a bare boolean could go into;
    // resolveDragMatch returns whichever role it tries first (see candidateConfigs) — either is a
    // legitimate match, so this only asserts the returned config actually matches the chosen slot.
    const def = getNodeDef("map.set");
    const match = resolveDragMatch(def, { type: "boolean" }, "input");
    expect(match).not.toBeNull();
    expect(["value", "key"]).toContain(match?.matchPin.id);
    if (match?.matchPin.id === "key") expect(match.config.mapKeyType).toBe("boolean");
    else expect(match?.config.elementType).toBe("boolean");
  });

  it("returns null when no configuration of the node can match the dragged pin", () => {
    const def = getNodeDef("array.length");
    const match = resolveDragMatch(def, { type: "exec" }, "input");
    expect(match).toBeNull();
  });
});
