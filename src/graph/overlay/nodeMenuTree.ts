export interface GroupNode<T> {
  kind: "group";
  name: string;
  /** Full dot-separated path from the root, e.g. "Math.Comparison" — used as a stable expand/collapse key. */
  path: string;
  children: MenuNode<T>[];
}

export interface LeafNode<T> {
  kind: "leaf";
  item: T;
}

export type MenuNode<T> = GroupNode<T> | LeafNode<T>;

interface Builder<T> {
  subgroups: Map<string, Builder<T>>;
  leaves: T[];
}

/** Builds a nested, alphabetically-sorted menu tree from a flat list of items, splitting each
 * item's dot-separated group string (from `getGroup`) into nested subgroups (e.g. "Math.Comparison"
 * nests a "Comparison" group inside "Math"). An empty group string attaches the item directly to
 * the root instead of nesting it under a group. Subgroups are listed before leaves at each level,
 * both sorted alphabetically by `getLabel`. */
export function buildMenuTree<T>(items: T[], getGroup: (item: T) => string, getLabel: (item: T) => string): MenuNode<T>[] {
  const root: Builder<T> = { subgroups: new Map(), leaves: [] };

  for (const item of items) {
    const segments = getGroup(item).split(".").filter(Boolean);
    let cursor = root;
    for (const segment of segments) {
      let next = cursor.subgroups.get(segment);
      if (!next) {
        next = { subgroups: new Map(), leaves: [] };
        cursor.subgroups.set(segment, next);
      }
      cursor = next;
    }
    cursor.leaves.push(item);
  }

  return toSortedNodes(root, "", getLabel);
}

function toSortedNodes<T>(builder: Builder<T>, pathPrefix: string, getLabel: (item: T) => string): MenuNode<T>[] {
  const groupNodes: GroupNode<T>[] = [...builder.subgroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => {
      const path = pathPrefix ? `${pathPrefix}.${name}` : name;
      return {
        kind: "group" as const,
        name,
        path,
        children: toSortedNodes(child, path, getLabel),
      };
    });

  const leafNodes: LeafNode<T>[] = builder.leaves
    .slice()
    .sort((a, b) => getLabel(a).localeCompare(getLabel(b)))
    .map((item) => ({ kind: "leaf" as const, item }));

  return [...groupNodes, ...leafNodes];
}

/** Every group path present in a tree — used to seed the "all expanded by default" state. */
export function allGroupPaths<T>(nodes: MenuNode<T>[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "group") {
      paths.push(node.path, ...allGroupPaths(node.children));
    }
  }
  return paths;
}

export interface VisibleRow<T> {
  depth: number;
  node: MenuNode<T>;
}

/** Flattens the tree into the rows currently visible given which group paths are expanded —
 * a collapsed group's children are omitted. Used for both rendering and keyboard navigation. */
export function flattenVisible<T>(nodes: MenuNode<T>[], expanded: ReadonlySet<string>, depth = 0): VisibleRow<T>[] {
  const rows: VisibleRow<T>[] = [];
  for (const node of nodes) {
    rows.push({ depth, node });
    if (node.kind === "group" && expanded.has(node.path)) {
      rows.push(...flattenVisible(node.children, expanded, depth + 1));
    }
  }
  return rows;
}
