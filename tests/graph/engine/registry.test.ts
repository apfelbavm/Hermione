import { describe, expect, it } from "vitest";
import { isPinTypeCompatible } from "@hermione/graph/engine/registry";

describe("isPinTypeCompatible", () => {
  it("is true for two plain (single-container) pins of the same type", () => {
    expect(isPinTypeCompatible({ type: "number" }, { type: "number" })).toBe(true);
  });

  it("is false for two plain pins of different types", () => {
    expect(isPinTypeCompatible({ type: "number" }, { type: "string" })).toBe(false);
  });

  it("treats an absent container the same as container: 'single'", () => {
    expect(isPinTypeCompatible({ type: "number", container: "single" }, { type: "number" })).toBe(true);
  });

  it("is true for two array pins of the same element type", () => {
    expect(isPinTypeCompatible({ type: "string", container: "array" }, { type: "string", container: "array" })).toBe(true);
  });

  it("is false between an array pin and a set pin of the same element type", () => {
    expect(isPinTypeCompatible({ type: "string", container: "array" }, { type: "string", container: "set" })).toBe(false);
  });

  it("is false between an array pin and a plain (single) pin of the same element type", () => {
    expect(isPinTypeCompatible({ type: "string", container: "array" }, { type: "string" })).toBe(false);
  });

  it("is false between two arrays of different element types", () => {
    expect(isPinTypeCompatible({ type: "number", container: "array" }, { type: "string", container: "array" })).toBe(false);
  });

  it("is true for two map pins with matching value type AND key type", () => {
    expect(isPinTypeCompatible({ type: "number", container: "map", keyType: "string" }, { type: "number", container: "map", keyType: "string" })).toBe(true);
  });

  it("is false for two map pins with matching value type but different key types", () => {
    expect(isPinTypeCompatible({ type: "number", container: "map", keyType: "string" }, { type: "number", container: "map", keyType: "boolean" })).toBe(false);
  });

  it("is false between two enum pins of different registered subTypes", () => {
    expect(isPinTypeCompatible({ type: "enum", subType: "a" }, { type: "enum", subType: "b" })).toBe(false);
  });

  it("is true between two enum pins of the same registered subType", () => {
    expect(isPinTypeCompatible({ type: "enum", subType: "a" }, { type: "enum", subType: "a" })).toBe(true);
  });

  it("is false between an enum pin and any other type on either side", () => {
    expect(isPinTypeCompatible({ type: "enum", subType: "a" }, { type: "string" })).toBe(false);
    expect(isPinTypeCompatible({ type: "string" }, { type: "enum", subType: "a" })).toBe(false);
  });
});
