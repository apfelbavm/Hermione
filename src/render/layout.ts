import type { PinDef } from "../engine/types";

export const NODE_HEADER_HEIGHT = 28;
export const PIN_ROW_HEIGHT = 24;
export const NODE_MIN_WIDTH = 170;
export const NODE_PADDING_X = 12;
export const PIN_RADIUS = 5;
export const PIN_MARGIN = 14;
export const ADD_BUTTON_SIZE = 16;

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
}

function textWidth(text: string): number {
  return text.length * CHAR_WIDTH;
}

export function computeNodeLayout(
  label: string,
  pinDefs: PinDef[],
  options?: { showAddButton?: boolean },
): NodeLayout {
  const inputs = pinDefs.filter((p) => p.direction === "input");
  const outputs = pinDefs.filter((p) => p.direction === "output");
  const showAddButton = options?.showAddButton ?? false;
  const inputRows = inputs.length + (showAddButton ? 1 : 0);
  const rows = Math.max(inputRows, outputs.length, 1);
  const height = NODE_HEADER_HEIGHT + rows * PIN_ROW_HEIGHT + 10;

  let widestRow = textWidth(label) + NODE_PADDING_X * 2;
  for (let i = 0; i < rows; i++) {
    const inLabel = inputs[i]?.label ?? "";
    const outLabel = outputs[i]?.label ?? "";
    const rowWidth =
      PIN_MARGIN * 2 + textWidth(inLabel) + textWidth(outLabel) + (inLabel && outLabel ? 40 : 20);
    widestRow = Math.max(widestRow, rowWidth);
  }
  const width = Math.max(NODE_MIN_WIDTH, Math.ceil(widestRow));

  const pins: PinLayout[] = [];
  inputs.forEach((pin, i) => {
    pins.push({ pin, x: 0, y: NODE_HEADER_HEIGHT + i * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2 });
  });
  outputs.forEach((pin, i) => {
    pins.push({ pin, x: width, y: NODE_HEADER_HEIGHT + i * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2 });
  });

  const addButton: NodeAddButtonLayout | undefined = showAddButton
    ? {
        x: PIN_MARGIN,
        y: NODE_HEADER_HEIGHT + inputs.length * PIN_ROW_HEIGHT + (PIN_ROW_HEIGHT - ADD_BUTTON_SIZE) / 2,
        width: ADD_BUTTON_SIZE,
        height: ADD_BUTTON_SIZE,
      }
    : undefined;

  return { width, height, pins, addButton };
}
