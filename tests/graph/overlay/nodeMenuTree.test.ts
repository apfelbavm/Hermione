import { describe, expect, it } from "vitest";
import type { NodeDef } from "@hermione/graph/engine/types";
import { allGroupPaths, buildMenuTree, flattenVisible } from "@hermione/graph/overlay/nodeMenuTree";

function fakeDef(type: string, label: string, group: string): NodeDef {
  return { type, label, description: "", group, pins: [] };
}

function buildNodeDefTree(defs: NodeDef[]) {
  return buildMenuTree(
    defs,
    (d) => d.group || "Other",
    (d) => d.label,
  );
}

describe("buildMenuTree", () => {
  it("nests a dot-separated group into subgroups", () => {
    const tree = buildNodeDefTree([fakeDef("math.add", "Add", "Math.Arithmetic"), fakeDef("math.compare", "Compare (A > B)", "Math.Comparison")]);

    expect(tree).toHaveLength(1);
    const math = tree[0];
    expect(math.kind).toBe("group");
    if (math.kind !== "group") throw new Error("expected group");
    expect(math.name).toBe("Math");
    expect(math.path).toBe("Math");
    expect(math.children.map((c) => (c.kind === "group" ? c.name : c.item.label))).toEqual(["Arithmetic", "Comparison"]);
  });

  it("sorts groups and leaves alphabetically at every level", () => {
    const tree = buildNodeDefTree([fakeDef("z.a", "Zebra", "Zoo"), fakeDef("a.a", "Apple", "Apple Group"), fakeDef("m.b", "Banana", "Middle"), fakeDef("m.a", "Avocado", "Middle")]);

    const topNames = tree.map((n) => (n.kind === "group" ? n.name : n.item.label));
    expect(topNames).toEqual(["Apple Group", "Middle", "Zoo"]);

    const middle = tree.find((n) => n.kind === "group" && n.name === "Middle");
    if (!middle || middle.kind !== "group") throw new Error("expected Middle group");
    expect(middle.children.map((c) => (c.kind === "leaf" ? c.item.label : c.name))).toEqual(["Avocado", "Banana"]);
  });

  it("lists subgroups before leaves within the same group", () => {
    const tree = buildNodeDefTree([fakeDef("flow.branch", "Branch", "Flow Control"), fakeDef("flow.forEach", "For Each", "Flow Control.Loops")]);

    const flowControl = tree.find((n) => n.kind === "group" && n.name === "Flow Control");
    if (!flowControl || flowControl.kind !== "group") throw new Error("expected group");
    expect(flowControl.children[0].kind).toBe("group");
    expect(flowControl.children[1].kind).toBe("leaf");
  });

  it("falls back to an 'Other' group for a blank group string", () => {
    const tree = buildNodeDefTree([fakeDef("mystery.node", "Mystery", "")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind === "group" && tree[0].name).toBe("Other");
  });
});

describe("flattenVisible", () => {
  it("omits a collapsed group's children", () => {
    const tree = buildNodeDefTree([fakeDef("math.add", "Add", "Math.Arithmetic"), fakeDef("math.compare", "Compare (A > B)", "Math.Comparison")]);

    const allExpanded = new Set(allGroupPaths(tree));
    // Math, Arithmetic, Add, Comparison, Compare
    expect(flattenVisible(tree, allExpanded)).toHaveLength(5);

    const noneExpanded = new Set<string>();
    const collapsedRows = flattenVisible(tree, noneExpanded);
    expect(collapsedRows).toHaveLength(1); // just the top-level "Math" group row
    expect(collapsedRows[0].node.kind).toBe("group");
  });
});
