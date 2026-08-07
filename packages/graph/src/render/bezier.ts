/** Shared curve math for wires — one source of truth for both drawing (drawWires.ts) and
 * hit-testing (hitTest.ts's hitTestWire), so a right-click never misses a wire the eye can see. */
export interface BezierGeometry {
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
}

/** (x1,y1) is always the OUTPUT/exit side (curve bulges right out of it), (x2,y2) the INPUT/entry
 * side (curve pulls in from the left into it) — same convention drawWireDragPreview already
 * documents for itself. */
export function bezierControlPoints(x1: number, y1: number, x2: number, y2: number): BezierGeometry {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return { x1, y1, cx1: x1 + dx, cy1: y1, cx2: x2 - dx, cy2: y2, x2, y2 };
}

/** Samples a cubic bezier into a polyline — used by hitTestWire for point-to-curve distance
 * (exact analytic distance-to-bezier isn't worth it at this scale; a few dozen segments is
 * indistinguishable from the true curve at any zoom level a user would actually click at). */
export function sampleBezier(g: BezierGeometry, segments: number = 24): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * g.x1 + 3 * mt * mt * t * g.cx1 + 3 * mt * t * t * g.cx2 + t * t * t * g.x2;
    const y = mt * mt * mt * g.y1 + 3 * mt * mt * t * g.cy1 + 3 * mt * t * t * g.cy2 + t * t * t * g.y2;
    points.push({ x, y });
  }
  return points;
}
