import type { NodeDef } from "../engine/types";

export interface GroupNode {
  kind: "group";
  name: string;
  /** Full dot-separated path from the root, e.g. "Math.Comparison" — used as a stable expand/collapse key. */
  path: string;
  children: MenuNode[];
}

export interface LeafNode {
  kind: "leaf";
  def: NodeDef;
}

export type MenuNode = GroupNode | LeafNode;

interface Builder {
  subgroups: Map<string, Builder>;
  leaves: NodeDef[];
}

/** Builds a nested, alphabetically-sorted menu tree from a flat list of node defs, splitting
 * each def's dot-separated `group` string into nested subgroups (e.g. "Math.Comparison" nests
 * a "Comparison" group inside "Math"). Subgroups are listed before leaves at each level. */
export function buildMenuTree(defs: NodeDef[]): MenuNode[] {
  const root: Builder = { subgroups: new Map(), leaves: [] };

  for (const def of defs) {
    const segments = (def.group || "Other").split(".").filter(Boolean);
    let cursor = root;
    for (const segment of segments) {
      let next = cursor.subgroups.get(segment);
      if (!next) {
        next = { subgroups: new Map(), leaves: [] };
        cursor.subgroups.set(segment, next);
      }
      cursor = next;
    }
    cursor.leaves.push(def);
  }

  return toSortedNodes(root, "");
}

function toSortedNodes(builder: Builder, pathPrefix: string): MenuNode[] {
  const groupNodes: GroupNode[] = [...builder.subgroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => {
      const path = pathPrefix ? `${pathPrefix}.${name}` : name;
      return { kind: "group" as const, name, path, children: toSortedNodes(child, path) };
    });

  const leafNodes: LeafNode[] = builder.leaves
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((def) => ({ kind: "leaf" as const, def }));

  return [...groupNodes, ...leafNodes];
}

/** Every group path present in a tree — used to seed the "all expanded by default" state. */
export function allGroupPaths(nodes: MenuNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "group") {
      paths.push(node.path, ...allGroupPaths(node.children));
    }
  }
  return paths;
}

export interface VisibleRow {
  depth: number;
  node: MenuNode;
}

/** Flattens the tree into the rows currently visible given which group paths are expanded —
 * a collapsed group's children are omitted. Used for both rendering and keyboard navigation. */
export function flattenVisible(nodes: MenuNode[], expanded: ReadonlySet<string>, depth = 0): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const node of nodes) {
    rows.push({ depth, node });
    if (node.kind === "group" && expanded.has(node.path)) {
      rows.push(...flattenVisible(node.children, expanded, depth + 1));
    }
  }
  return rows;
}
