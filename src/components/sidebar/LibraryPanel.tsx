"use client";

import { useMemo, useState } from "react";
import { i18n } from "@i18n";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import { allNodeDefs, topLevelGroup } from "@hermione/graph/engine/registry";
import type { NodeDef } from "@hermione/graph/engine/types";
import { buildMenuTree, flattenVisible, type MenuNode, type VisibleRow } from "@hermione/graph/overlay/nodeMenuTree";
import { snapPositionToGrid } from "@hermione/graph/render/drawGrid";
import { getEditingGraph, type Store } from "@hermione/graph/state/store";
import { useStoreRevision } from "@hermione/graph/state/useStore";
import { getStoredCollapsed, getStoredExpandedGroups, setStoredCollapsed, setStoredExpandedGroups } from "../../client/collapsedSections";
import { IconManager } from "../../shared/iconManager";

const LIBRARY_SECTION_ID = "library-section";
const EXCLUDED_TOP_LEVEL_GROUPS = ["Variables", "Functions", "Code", "Internal"];

/** Same candidate set as the canvas's empty-space right-click menu (see AppShell's
 * `filterCreatableHere` + its `onCanvasContextMenu`) — Variables/Functions/Code already have
 * dedicated sidebar panels, and Internal nodes aren't meant to be hand-placed. */
function creatableNodeDefs(store: Store): NodeDef[] {
  const graph = getEditingGraph(store.state);
  const isFunctionBody = store.state.activeFunctionId !== null;
  return allNodeDefs().filter((def) => !EXCLUDED_TOP_LEVEL_GROUPS.includes(topLevelGroup(def.group)) && graph.canPlaceNodeType(def.type, isFunctionBody));
}

export function LibraryPanel({ store }: { store: Store }) {
  useStoreRevision(store);
  const [collapsed, setCollapsedState] = useState(() => getStoredCollapsed(LIBRARY_SECTION_ID));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => getStoredExpandedGroups());

  function setCollapsed(next: boolean): void {
    setCollapsedState(next);
    setStoredCollapsed(LIBRARY_SECTION_ID, next);
  }

  const disabled = store.state.simulating || store.state.readOnly;
  const candidates = useMemo(() => creatableNodeDefs(store), [store, store.state.activeFunctionId, store.state.rootGraph]);
  const tree = useMemo<MenuNode<NodeDef>[]>(
    () =>
      buildMenuTree(
        candidates,
        (d) => d.group || "Other",
        (d) => d.label,
      ),
    [candidates],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const flatMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    return candidates.filter((d) => d.label.toLowerCase().includes(trimmedQuery) || d.group.toLowerCase().includes(trimmedQuery)).sort((a, b) => a.label.localeCompare(b.label));
  }, [candidates, trimmedQuery]);

  const treeRows: VisibleRow<NodeDef>[] = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);

  function toggleGroup(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      setStoredExpandedGroups(next);
      return next;
    });
  }

  function handlePick(def: NodeDef): void {
    if (disabled) return;
    const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement | null;
    const screenCenter = canvas ? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } : { x: 0, y: 0 };
    const worldPos = store.state.camera.screenToWorld(screenCenter.x, screenCenter.y);
    const position = store.state.snapToGrid ? snapPositionToGrid(worldPos) : worldPos;
    const node = NodeInstance.createNodeInstance(def.type, position, def.pins);
    getEditingGraph(store.state).addNode(node);
    store.notify();
  }

  return (
    <div id={LIBRARY_SECTION_ID} className={"panel-section" + (collapsed ? " collapsed" : "")}>
      <div className="panel-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="panel-header-arrow">{collapsed ? <IconManager.ChevronRightIcon /> : <IconManager.ChevronDownIcon />}</span>
        <span className="panel-header-title">{i18n.components.library_panel.header}</span>
      </div>
      <div className="panel-body library-panel-body">
        <input type="text" className="node-search-input library-search-input" placeholder={i18n.components.library_panel.search_placeholder} value={query} disabled={disabled} onChange={(e) => setQuery(e.target.value)} />
        <ul className="node-search-list library-panel-list">
          {trimmedQuery ? (
            flatMatches.length === 0 ? (
              <li className="node-search-empty">{i18n.components.library_panel.empty}</li>
            ) : (
              flatMatches.map((def) => (
                <li key={def.type} className="node-search-result" title={def.description || def.group} onClick={() => handlePick(def)}>
                  <span className="node-search-result-label">{def.label}</span>
                  <span className="node-search-result-group">{def.group}</span>
                </li>
              ))
            )
          ) : (
            treeRows.map((row, i) => {
              if (row.node.kind === "group") {
                const group = row.node;
                return (
                  <li key={`g:${group.path}`} className="node-search-tree-row node-search-group" style={{ paddingLeft: 8 + row.depth * 14 }} onClick={() => toggleGroup(group.path)}>
                    <span className="node-search-row-icon">{expanded.has(group.path) ? <IconManager.ChevronDownIcon /> : <IconManager.ChevronRightIcon />}</span>
                    <span className="node-search-row-label">{group.name}</span>
                  </li>
                );
              }
              const def = row.node.item;
              return (
                <li key={`${def.type}:${i}`} className="node-search-tree-row" style={{ paddingLeft: 8 + row.depth * 14 }} title={def.description || def.group} onClick={() => handlePick(def)}>
                  <span className="node-search-row-icon" />
                  <span className="node-search-row-label">{def.label}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
