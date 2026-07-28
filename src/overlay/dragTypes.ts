/** Custom drag-and-drop MIME types used when dragging a Functions/Variables sidebar row onto the
 * canvas — shared between the panels (dragstart) and main.ts's canvas drop handler, so the two
 * sides can't drift out of sync on the string value. */
export const FUNCTION_DRAG_MIME = "application/x-hermione-function-id";
export const VARIABLE_DRAG_MIME = "application/x-hermione-variable-id";
/** A function's Input/Output signature row (see functionIoPanel.ts) — reorder-only, never dropped
 * on the canvas, so unlike the two above this one never needs to reach main.ts. */
export const FUNCTION_IO_ENTRY_DRAG_MIME = "application/x-hermione-function-io-entry-id";
