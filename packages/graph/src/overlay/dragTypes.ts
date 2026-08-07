/** Custom drag-and-drop MIME types used when dragging a Functions/Variables sidebar row onto the
 * canvas — shared between the panels (dragstart) and main.ts's canvas drop handler, so the two
 * sides can't drift out of sync on the string value. */
export const FUNCTION_DRAG_MIME = "application/x-hermione-function-id";
export const VARIABLE_DRAG_MIME = "application/x-hermione-variable-id";
/** A function's Input/Output signature row (see functionIoPanel.ts) — reorder-only, never dropped
 * on the canvas, so unlike the two above this one never needs to reach main.ts. */
export const FUNCTION_IO_ENTRY_DRAG_MIME = "application/x-hermione-function-io-entry-id";
/** A Scripts sidebar row (see scriptsPanel.ts) — dropped on the canvas spawns a bound Code node,
 * same idea as FUNCTION_DRAG_MIME. */
export const SCRIPT_DRAG_MIME = "application/x-hermione-script-id";
/** A script's Input signature row (see scriptIoPanel.ts) — reorder-only, mirrors
 * FUNCTION_IO_ENTRY_DRAG_MIME. */
export const SCRIPT_IO_ENTRY_DRAG_MIME = "application/x-hermione-script-io-entry-id";
