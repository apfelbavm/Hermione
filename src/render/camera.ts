export interface Camera {
  /** World-space coordinates visible at the screen's top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(): Camera {
  return { x: -100, y: -100, zoom: 1 };
}

export function worldToScreen(camera: Camera, worldX: number, worldY: number) {
  return { x: (worldX - camera.x) * camera.zoom, y: (worldY - camera.y) * camera.zoom };
}

export function screenToWorld(camera: Camera, screenX: number, screenY: number) {
  return { x: screenX / camera.zoom + camera.x, y: screenY / camera.zoom + camera.y };
}

export function panCamera(camera: Camera, dxScreen: number, dyScreen: number): void {
  camera.x -= dxScreen / camera.zoom;
  camera.y -= dyScreen / camera.zoom;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

/** Zooms while keeping the world point currently under (screenX, screenY) fixed on screen. */
export function zoomCameraAt(camera: Camera, screenX: number, screenY: number, factor: number): void {
  const before = screenToWorld(camera, screenX, screenY);
  camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const after = screenToWorld(camera, screenX, screenY);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

/** "Frame all" / zoom-to-fit — pans and zooms so `rect` (world space, e.g. the bounding box of
 * every node) fills the viewport with `paddingPx` of breathing room, clamped to this same
 * MIN_ZOOM/MAX_ZOOM every other zoom interaction respects. When the rect is too large to fit even
 * at MIN_ZOOM, centering it would still crop most of it either way — pinning its top-left corner
 * to the viewport's top-left instead at least keeps a consistent, predictable starting point. */
export function frameRect(
  camera: Camera,
  rect: { x: number; y: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
  paddingPx: number = 60,
): void {
  const availableWidth = Math.max(1, viewportWidth - paddingPx * 2);
  const availableHeight = Math.max(1, viewportHeight - paddingPx * 2);
  const fitZoom = Math.min(availableWidth / Math.max(1, rect.width), availableHeight / Math.max(1, rect.height));
  camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));

  if (fitZoom >= MIN_ZOOM) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    camera.x = centerX - viewportWidth / 2 / camera.zoom;
    camera.y = centerY - viewportHeight / 2 / camera.zoom;
  } else {
    camera.x = rect.x - paddingPx / camera.zoom;
    camera.y = rect.y - paddingPx / camera.zoom;
  }
}
