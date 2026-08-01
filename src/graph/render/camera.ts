const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

/** The camera's own world-space position (visible at the screen's top-left corner) and zoom level,
 * plus every conversion/mutation that operates on them — pan, zoom-at-a-point, frame-to-fit, and
 * the world<->screen conversions everything else in render/ and interaction/ reads through. A
 * class rather than a plain data object + free functions so each of those lives right alongside
 * the state it reads/mutates, instead of every call site re-passing `camera` as a first argument. */
export class Camera {
  /** World-space coordinates visible at the screen's top-left corner. */
  x: number;
  y: number;
  zoom: number;

  constructor(x: number = -100, y: number = -100, zoom: number = 1) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return { x: (worldX - this.x) * this.zoom, y: (worldY - this.y) * this.zoom };
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return { x: screenX / this.zoom + this.x, y: screenY / this.zoom + this.y };
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Zooms while keeping the world point currently under (screenX, screenY) fixed on screen. */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** "Frame all" / zoom-to-fit — pans and zooms so `rect` (world space, e.g. the bounding box of
   * every node) fills the viewport with `paddingPx` of breathing room, clamped to this same
   * MIN_ZOOM/MAX_ZOOM every other zoom interaction respects. When the rect is too large to fit even
   * at MIN_ZOOM, centering it would still crop most of it either way — pinning its top-left corner
   * to the viewport's top-left instead at least keeps a consistent, predictable starting point. */
  frameRect(rect: { x: number; y: number; width: number; height: number }, viewportWidth: number, viewportHeight: number, paddingPx: number = 60): void {
    const availableWidth = Math.max(1, viewportWidth - paddingPx * 2);
    const availableHeight = Math.max(1, viewportHeight - paddingPx * 2);
    const fitZoom = Math.min(availableWidth / Math.max(1, rect.width), availableHeight / Math.max(1, rect.height));
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));

    if (fitZoom >= MIN_ZOOM) {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      this.x = centerX - viewportWidth / 2 / this.zoom;
      this.y = centerY - viewportHeight / 2 / this.zoom;
    } else {
      this.x = rect.x - paddingPx / this.zoom;
      this.y = rect.y - paddingPx / this.zoom;
    }
  }
}
