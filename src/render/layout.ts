import type { PinDef } from "../engine/types";

export const NODE_HEADER_HEIGHT = 28;
export const PIN_ROW_HEIGHT = 24;
export const NODE_MIN_WIDTH = 170;
export const NODE_PADDING_X = 12;
export const PIN_RADIUS = 5;
export const PIN_MARGIN = 14;
/** How far an input pin's dot sits inset from the node's left edge — purely cosmetic breathing room
 * (an output pin's dot stays flush against the right edge, unchanged). PIN_MARGIN (used for a row's
 * left-margin width budget) already assumed this exact gap plus PIN_LABEL_GAP (4 + 10 = 14), so
 * insetting the dot to this position needs no other width-math adjustment. */
export const PIN_INSET_X = 8;
export const ADD_BUTTON_SIZE = 16;
/** Width/height of a "compact" node's whole box (see NodeDef.compact) — just big enough to hold
 * its one input and one output pin dot side by side, no header/label rows. */
export const COMPACT_NODE_SIZE = 24;
/** Gap between a pin's dot and where its label text starts (input side) or ends (output side) —
 * mirrors the same 10px offset drawNodes.ts draws labels at. */
export const PIN_LABEL_GAP = 10;
/** Gap between the end of an input pin's label and the start of its literal-value widget. */
export const LABEL_WIDGET_GAP = 10;
/** Gap held between an input widget's right edge and the start of the reserved output-label zone. */
export const WIDGET_OUTPUT_GAP = 10;
/** Width of a multiline string pin's "expand" button (see PinDef.multiline), reserved alongside its
 * normal single-line widget width — kept in one place so layout.ts and widgetSync.ts can't drift. */
export const MULTILINE_EXPAND_BUTTON_WIDTH = 20;

// Rough monospace-ish average character width at the render font size (13px),
// used for layout sizing without needing a canvas context available.
export const CHAR_WIDTH = 6.6;

export interface PinLayout {
  pin: PinDef;
  x: number;
  y: number;
}

export interface NodeAddButtonLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeLayout {
  width: number;
  height: number;
  pins: PinLayout[];
  /** Present only for a node whose type has NodeDef.addInstancePinEntry — an extra row below its
   * last input pin where the canvas draws a "+" affordance to add another entry. */
  addButton?: NodeAddButtonLayout;
  /** World-space x (relative to the node's own left edge, same space as PinLayout.x) where every
   * input pin's literal-value widget's RIGHT edge lines up. Common across all input rows so the
   * widgets read as one clean right-aligned column instead of each trailing raggedly right after
   * its own row's (possibly much shorter) label — capped so it never runs into the space reserved
   * for this node's longest OUTPUT pin label, when it has any output pins at all. */
  inputWidgetRightX: number;
}

function textWidth(text: string): number {
  return text.length * CHAR_WIDTH;
}

/** Natural width of a pin's literal-value widget in the canvas overlay (see widgetSync.ts) — the
 * single source of truth shared by node-width sizing here and widget positioning there, so the two
 * can never drift apart. Exec pins never get a widget (0). */
export function pinWidgetWidth(pin: PinDef): number {
  if (pin.type === "exec") return 0;
  // Array/Set/Map pins are wiring-only on the canvas, same treatment "object" already gets — no
  // inline literal editor (see typedValueInput.ts's list editor for the Details-panel equivalent).
  if (pin.container && pin.container !== "single") return 0;
  if (pin.type === "boolean") return 16;
  if ((pin.type === "string" || pin.type === "enum") && pin.options && pin.options.length > 0) return 110;
  if (pin.type === "number") return 54;
  if (pin.type === "string" && pin.multiline) return 90 + MULTILINE_EXPAND_BUTTON_WIDTH + 4;
  if (pin.type === "date") return 150;
  return 90;
}

export function computeNodeLayout(
  label: string,
  pinDefs: PinDef[],
  options?: { showAddButton?: boolean; compact?: boolean },
): NodeLayout {
  if (options?.compact) {
    const size = COMPACT_NODE_SIZE;
    const pins: PinLayout[] = pinDefs.map((pin) => ({
      pin,
      x: pin.direction === "input" ? 0 : size,
      y: size / 2,
    }));
    return { width: size, height: size, pins, inputWidgetRightX: size };
  }

  const inputs = pinDefs.filter((p) => p.direction === "input");
  const outputs = pinDefs.filter((p) => p.direction === "output");
  const showAddButton = options?.showAddButton ?? false;
  const inputRows = inputs.length + (showAddButton ? 1 : 0);
  const rows = Math.max(inputRows, outputs.length, 1);
  const height = NODE_HEADER_HEIGHT + rows * PIN_ROW_HEIGHT + 10;

  const outputLabelMaxWidth = outputs.reduce((max, p) => Math.max(max, textWidth(p.label)), 0);
  const rightReserve =
    outputs.length > 0 ? PIN_LABEL_GAP + outputLabelMaxWidth + WIDGET_OUTPUT_GAP : PIN_MARGIN;

  let widestRow = textWidth(label) + NODE_PADDING_X * 2;
  for (let i = 0; i < rows; i++) {
    const inPin = inputs[i];
    const inLabel = inPin?.label ?? "";
    const outLabel = outputs[i]?.label ?? "";
    const widgetWidth = inPin ? pinWidgetWidth(inPin) : 0;
    const rowWidth =
      PIN_MARGIN +
      textWidth(inLabel) +
      (widgetWidth > 0 ? LABEL_WIDGET_GAP + widgetWidth : outLabel ? 20 : 0) +
      rightReserve;
    widestRow = Math.max(widestRow, rowWidth);
  }
  const width = Math.max(NODE_MIN_WIDTH, Math.ceil(widestRow));
  const inputWidgetRightX = width - rightReserve;

  const pins: PinLayout[] = [];
  inputs.forEach((pin, i) => {
    pins.push({
      pin,
      x: PIN_INSET_X,
      y: NODE_HEADER_HEIGHT + i * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2,
    });
  });
  outputs.forEach((pin, i) => {
    pins.push({ pin, x: width - PIN_INSET_X, y: NODE_HEADER_HEIGHT + i * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2 });
  });

  const addButton: NodeAddButtonLayout | undefined = showAddButton
    ? {
        x: PIN_MARGIN,
        y: NODE_HEADER_HEIGHT + inputs.length * PIN_ROW_HEIGHT + (PIN_ROW_HEIGHT - ADD_BUTTON_SIZE) / 2,
        width: ADD_BUTTON_SIZE,
        height: ADD_BUTTON_SIZE,
      }
    : undefined;

  return { width, height, pins, addButton, inputWidgetRightX };
}
