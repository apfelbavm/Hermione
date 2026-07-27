import { setPinLiteralValue } from "../engine/graphMutations";
import type { PinDef, PinType } from "../engine/types";
import type { Camera } from "../render/camera";
import { CHAR_WIDTH } from "../render/layout";
import type { NodeScreenGeometry } from "../render/nodeGeometry";
import type { Store } from "../state/store";

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
    const { graph, camera } = store.state;
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
          entry = createWidgetEntry(pinDef.type, node.id, pinDef.id, store);
          widgets.set(key, entry);
          overlay.appendChild(entry.el);
        }

        positionWidget(entry.el, geo.pinScreen[pinDef.id], pinDef, camera);
        if (document.activeElement !== entry.el) {
          setWidgetDisplayValue(entry.el, pinDef.type, pin?.value);
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

function createWidgetEntry(type: PinType, nodeId: string, pinId: string, store: Store): WidgetEntry {
  const el = document.createElement("input");
  el.className = "pin-widget";
  el.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : "text";
  el.autocomplete = "off";

  const commit = () => {
    const value = type === "boolean" ? el.checked : type === "number" ? Number(el.value) : el.value;
    setPinLiteralValue(store.state.graph, nodeId, pinId, value);
    store.notify();
  };
  el.addEventListener("change", commit);
  if (type !== "boolean") el.addEventListener("input", commit);
  el.addEventListener("mousedown", (e) => e.stopPropagation());

  return { el };
}

function setWidgetDisplayValue(el: HTMLInputElement, type: PinType, value: unknown): void {
  if (type === "boolean") {
    el.checked = Boolean(value);
  } else {
    el.value = value == null ? "" : String(value);
  }
}

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
