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
