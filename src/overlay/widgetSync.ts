import { setPinLiteralValue } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { PinDef, PinType } from "../engine/types";
import { guardAgainstMultilinePaste, openMultilineTextEditor } from "./multilineTextEditor";
import type { Camera } from "../render/camera";
import { MULTILINE_EXPAND_BUTTON_WIDTH, pinWidgetWidth } from "../render/layout";
import type { NodeScreenGeometry } from "../render/nodeGeometry";
import { getEditingGraph, type Store } from "../state/store";

const WIDGET_TYPES: readonly PinType[] = ["number", "boolean", "string"];

type WidgetElement = HTMLInputElement | HTMLSelectElement;

interface WidgetEntry {
  el: WidgetElement;
  /** Present only for a multiline string pin (see PinDef.multiline) — opens a floating textarea
   * (multilineTextEditor.ts) to edit the pin's full value, since `el` itself is still a plain
   * single-line <input> that silently collapses real newlines to spaces. */
  expandButton?: HTMLButtonElement;
  /** Snapshot of whatever about this pin's def determines the widget's DOM shape (see
   * widgetSignature) — compared every sync() pass so a pin whose TYPE changes without its id
   * changing (e.g. an Array/Set/Map node's entry-N pin after its Element Type is switched via the
   * Details panel, or a Map's key-N/value-N pins after a key/value type change) gets a freshly
   * rebuilt widget instead of silently keeping its old, now-mismatched one (a stale number <input>
   * would never become a checkbox just because the underlying pin turned into a boolean). */
  signature: string;
}

/** Everything about a PinDef that determines which kind of DOM element its widget must be —
 * two calls with the same signature are safe to keep sharing one cached widget element. */
function widgetSignature(pinDef: PinDef): string {
  return [pinDef.type, pinDef.integer ? "int" : "", pinDef.multiline ? "multiline" : "", (pinDef.options ?? []).join(",")].join("|");
}

export interface WidgetSync {
  sync: (geometries: ReadonlyMap<string, NodeScreenGeometry>) => void;
}

/** Keeps a real DOM <input>/<select> alive per unconnected literal-value pin, positioned over the canvas each frame. */
export function createWidgetSync(overlay: HTMLElement, store: Store): WidgetSync {
  const widgets = new Map<string, WidgetEntry>();

  function sync(geometries: ReadonlyMap<string, NodeScreenGeometry>): void {
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const seen = new Set<string>();

    for (const node of graph.nodes) {
      const geo = geometries.get(node.id);
      if (!geo) continue;
      // A reroute "knot" (see NodeDef.compact) is always meant to be wired straight through — its
      // pin is drawn far too small to also host a literal-value <input>, so it never gets one even
      // in the edge case where its incoming wire gets disconnected out from under it.
      if (getNodeDef(node.type).compact) continue;

      for (const pinLayout of geo.layout.pins) {
        const pinDef = pinLayout.pin;
        if (pinDef.direction !== "input" || !WIDGET_TYPES.includes(pinDef.type)) continue;
        // Array/Set/Map pins are wiring-only on the canvas (see pinWidgetWidth) — a literal widget
        // here would edit the container's value as if it were one scalar, corrupting it.
        if (pinDef.container && pinDef.container !== "single") continue;

        const pin = node.pins[pinDef.id];
        if (pin?.connectionId) continue; // wired — no literal widget, per Unreal pin behavior

        const key = `${node.id}:${pinDef.id}`;
        seen.add(key);
        const signature = widgetSignature(pinDef);

        let entry = widgets.get(key);
        if (entry && entry.signature !== signature) {
          entry.el.remove();
          entry.expandButton?.remove();
          widgets.delete(key);
          entry = undefined;
        }
        if (!entry) {
          entry = createWidgetEntry(pinDef, node.id, pinDef.id, store);
          widgets.set(key, entry);
          overlay.appendChild(entry.el);
          if (entry.expandButton) overlay.appendChild(entry.expandButton);
        }

        positionWidget(entry, geo.pinScreen[pinDef.id].y, geo, pinDef, camera);
        if (document.activeElement !== entry.el) {
          setWidgetDisplayValue(entry.el, pinDef, pin?.value);
        }
      }
    }

    for (const [key, entry] of widgets) {
      if (!seen.has(key)) {
        entry.el.remove();
        entry.expandButton?.remove();
        widgets.delete(key);
      }
    }
  }

  return { sync };
}

function createWidgetEntry(pinDef: PinDef, nodeId: string, pinId: string, store: Store): WidgetEntry {
  const signature = widgetSignature(pinDef);
  if (pinDef.type === "string" && pinDef.options && pinDef.options.length > 0) {
    return { el: createOptionsWidgetElement(pinDef.options, nodeId, pinId, store), signature };
  }

  const type = pinDef.type;
  const el = document.createElement("input");
  el.className = "pin-widget";
  el.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : "text";
  el.autocomplete = "off";
  if (pinDef.integer) el.step = "1";
  if (pinDef.multiline) el.title = 'Use the "⤢" button to edit multi-line text without losing line breaks';

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

  let expandButton: HTMLButtonElement | undefined;
  if (type === "string" && pinDef.multiline) {
    const commitFullValue = (newValue: string) => {
      setPinLiteralValue(getEditingGraph(store.state), nodeId, pinId, newValue);
      el.value = newValue;
      store.notify();
    };

    guardAgainstMultilinePaste(el, commitFullValue);

    expandButton = document.createElement("button");
    expandButton.className = "pin-widget-expand";
    expandButton.textContent = "⤢";
    expandButton.title = "Edit full text";
    expandButton.addEventListener("mousedown", (e) => e.stopPropagation());
    expandButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const rect = expandButton!.getBoundingClientRect();
      const currentPin = getEditingGraph(store.state).nodes.find((n) => n.id === nodeId)?.pins[pinId];
      openMultilineTextEditor({ x: rect.left, y: rect.bottom + 4 }, String(currentPin?.value ?? ""), commitFullValue);
    });
  }

  return { el, expandButton, signature };
}

function createOptionsWidgetElement(options: string[], nodeId: string, pinId: string, store: Store): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "pin-widget pin-widget-select";
  for (const option of options) {
    const optionEl = document.createElement("option");
    optionEl.value = option;
    optionEl.textContent = option;
    select.appendChild(optionEl);
  }
  select.addEventListener("change", () => {
    setPinLiteralValue(getEditingGraph(store.state), nodeId, pinId, select.value);
    store.notify();
  });
  select.addEventListener("mousedown", (e) => e.stopPropagation());

  return select;
}

function setWidgetDisplayValue(el: WidgetElement, pinDef: PinDef, value: unknown): void {
  if (pinDef.type === "boolean" && el instanceof HTMLInputElement) {
    el.checked = Boolean(value);
  } else if (pinDef.type === "number" && pinDef.integer && typeof value === "number") {
    el.value = String(Math.round(value));
  } else {
    el.value = value == null ? "" : String(value);
  }
}

// Every input widget in a node lines up on its RIGHT edge at geo.layout.inputWidgetRightX (see
// layout.ts) instead of trailing right after its own row's label — a straight column instead of a
// ragged one, capped so it never grows into the space reserved for the node's longest output label.
// Everything scales together with zoom — like the rest of the graph, this is a camera zooming over
// world-space content, not a fixed screen-space UI overlay.
function positionWidget(
  entry: WidgetEntry,
  pinScreenY: number,
  geo: NodeScreenGeometry,
  pinDef: PinDef,
  camera: Camera,
): void {
  const { el, expandButton } = entry;
  const totalWidthPx = pinWidgetWidth(pinDef) * camera.zoom;
  const rightX = geo.screenX + geo.layout.inputWidgetRightX * camera.zoom;
  const heightPx = (pinDef.type === "boolean" ? 16 : 18) * camera.zoom;
  const top = pinScreenY - heightPx / 2;

  const buttonWidthPx = expandButton ? (MULTILINE_EXPAND_BUTTON_WIDTH + 4) * camera.zoom : 0;
  const inputWidthPx = totalWidthPx - buttonWidthPx;

  el.style.position = "absolute";
  el.style.left = `${rightX - inputWidthPx}px`;
  el.style.top = `${top}px`;
  el.style.width = `${inputWidthPx}px`;
  el.style.height = `${heightPx}px`;
  el.style.fontSize = `${11 * camera.zoom}px`;

  if (expandButton) {
    expandButton.style.position = "absolute";
    expandButton.style.left = `${rightX - totalWidthPx}px`;
    expandButton.style.top = `${top}px`;
    expandButton.style.width = `${buttonWidthPx - 4 * camera.zoom}px`;
    expandButton.style.height = `${heightPx}px`;
    expandButton.style.fontSize = `${11 * camera.zoom}px`;
  }
}
