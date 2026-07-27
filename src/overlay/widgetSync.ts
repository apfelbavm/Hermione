import { setPinLiteralValue } from "../engine/graphMutations";
import type { PinDef, PinType } from "../engine/types";
import type { Camera } from "../render/camera";
import { CHAR_WIDTH } from "../render/layout";
import type { NodeScreenGeometry } from "../render/nodeGeometry";
import { getEditingGraph, type Store } from "../state/store";

const WIDGET_TYPES: readonly PinType[] = ["number", "boolean", "string"];

interface WidgetEntry {
  el: HTMLInputElement;
}

export interface WidgetSync {
  sync: (geometries: ReadonlyMap<string, NodeScreenGeometry>) => void;
}

/** Keeps a real DOM <input> alive per unconnected literal-value pin, positioned over the canvas each frame. */
export function createWidgetSync(overlay: HTMLElement, store: Store): WidgetSync {
  const widgets = new Map<string, WidgetEntry>();

  function sync(geometries: ReadonlyMap<string, NodeScreenGeometry>): void {
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const seen = new Set<string>();

    for (const node of graph.nodes) {
      const geo = geometries.get(node.id);
      if (!geo) continue;

      for (const pinLayout of geo.layout.pins) {
        const pinDef = pinLayout.pin;
        if (pinDef.direction !== "input" || !WIDGET_TYPES.includes(pinDef.type)) continue;

        const pin = node.pins[pinDef.id];
        if (pin?.connectionId) continue; // wired — no literal widget, per Unreal pin behavior

        const key = `${node.id}:${pinDef.id}`;
        seen.add(key);

        let entry = widgets.get(key);
        if (!entry) {
          entry = createWidgetEntry(pinDef, node.id, pinDef.id, store);
          widgets.set(key, entry);
          overlay.appendChild(entry.el);
        }

        positionWidget(entry.el, geo.pinScreen[pinDef.id], pinDef, camera);
        if (document.activeElement !== entry.el) {
          setWidgetDisplayValue(entry.el, pinDef, pin?.value);
        }
      }
    }

    for (const [key, entry] of widgets) {
      if (!seen.has(key)) {
        entry.el.remove();
        widgets.delete(key);
      }
    }
  }

  return { sync };
}

function createWidgetEntry(pinDef: PinDef, nodeId: string, pinId: string, store: Store): WidgetEntry {
  const type = pinDef.type;
  const el = document.createElement("input");
  el.className = "pin-widget";
  el.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : "text";
  el.autocomplete = "off";
  if (pinDef.integer) el.step = "1";

  // On every keystroke ("input") the graph's own value always rounds immediately if this is an
  // integer pin — but the textbox itself is only corrected once the user's done editing ("change",
  // i.e. blur/Enter): rewriting it mid-keystroke would fight typing a decimal at all (e.g. the "."
  // in "2.7" would be stripped the instant it's typed, before the "7" ever lands).
  const commit = (redisplay: boolean) => {
    let value: unknown;
    if (type === "boolean") value = el.checked;
    else if (type === "number") value = pinDef.integer ? Math.round(Number(el.value)) : Number(el.value);
    else value = el.value;

    setPinLiteralValue(getEditingGraph(store.state), nodeId, pinId, value);
    if (redisplay && type === "number" && pinDef.integer) el.value = String(value);
    store.notify();
  };
  el.addEventListener("change", () => commit(true));
  if (type !== "boolean") el.addEventListener("input", () => commit(false));
  el.addEventListener("mousedown", (e) => e.stopPropagation());

  return { el };
}

function setWidgetDisplayValue(el: HTMLInputElement, pinDef: PinDef, value: unknown): void {
  if (pinDef.type === "boolean") {
    el.checked = Boolean(value);
  } else if (pinDef.type === "number" && pinDef.integer && typeof value === "number") {
    el.value = String(Math.round(value));
  } else {
    el.value = value == null ? "" : String(value);
  }
}

// Everything scales together with zoom — like the rest of the graph, this is a camera
// zooming over world-space content, not a fixed screen-space UI overlay.
function positionWidget(
  el: HTMLInputElement,
  pinScreenPos: { x: number; y: number },
  pinDef: PinDef,
  camera: Camera,
): void {
  const type = pinDef.type;
  const labelWidth = pinDef.label.length * CHAR_WIDTH * camera.zoom;
  const x = pinScreenPos.x + 14 * camera.zoom + labelWidth;
  const widthPx = (type === "boolean" ? 16 : type === "number" ? 54 : 90) * camera.zoom;
  const heightPx = (type === "boolean" ? 16 : 18) * camera.zoom;

  el.style.position = "absolute";
  el.style.left = `${x}px`;
  el.style.top = `${pinScreenPos.y - heightPx / 2}px`;
  el.style.width = `${widthPx}px`;
  el.style.height = `${heightPx}px`;
  el.style.fontSize = `${11 * camera.zoom}px`;
}
