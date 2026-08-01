import { describe, expect, it } from "vitest";
import { Camera } from "../../../src/graph/render/camera";

describe("Camera", () => {
  it("defaults to a fixed starting position/zoom when constructed with no arguments", () => {
    const camera = new Camera();
    expect(camera.x).toBe(-100);
    expect(camera.y).toBe(-100);
    expect(camera.zoom).toBe(1);
  });

  it("accepts an explicit starting position/zoom", () => {
    const camera = new Camera(10, 20, 2);
    expect(camera.x).toBe(10);
    expect(camera.y).toBe(20);
    expect(camera.zoom).toBe(2);
  });

  describe("worldToScreen / screenToWorld", () => {
    it("round-trips a point through both conversions", () => {
      const camera = new Camera(50, -30, 1.5);
      const screen = camera.worldToScreen(120, 80);
      const world = camera.screenToWorld(screen.x, screen.y);
      expect(world.x).toBeCloseTo(120);
      expect(world.y).toBeCloseTo(80);
    });

    it("maps the camera's own (x, y) to the screen origin", () => {
      const camera = new Camera(50, -30, 2);
      expect(camera.worldToScreen(50, -30)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("pan", () => {
    it("moves the camera by the screen delta divided by zoom", () => {
      const camera = new Camera(0, 0, 2);
      camera.pan(20, 10);
      expect(camera.x).toBe(-10);
      expect(camera.y).toBe(-5);
    });
  });

  describe("zoomAt", () => {
    it("keeps the world point under the given screen position fixed on screen", () => {
      const camera = new Camera(0, 0, 1);
      const screenPos = { x: 100, y: 50 };
      const worldBefore = camera.screenToWorld(screenPos.x, screenPos.y);

      camera.zoomAt(screenPos.x, screenPos.y, 2);

      const worldAfter = camera.screenToWorld(screenPos.x, screenPos.y);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y);
      expect(camera.zoom).toBe(2);
    });

    it("clamps to the minimum zoom instead of zooming out indefinitely", () => {
      const camera = new Camera(0, 0, 1);
      camera.zoomAt(0, 0, 0.0001);
      expect(camera.zoom).toBe(0.2);
    });

    it("clamps to the maximum zoom instead of zooming in indefinitely", () => {
      const camera = new Camera(0, 0, 1);
      camera.zoomAt(0, 0, 10000);
      expect(camera.zoom).toBe(2.5);
    });
  });

  describe("frameRect", () => {
    it("centers the rect in the viewport at a zoom that fits it with padding", () => {
      const camera = new Camera(0, 0, 1);
      camera.frameRect({ x: 100, y: 100, width: 200, height: 100 }, 800, 600, 60);

      // Fits within (800 - 120) x (600 - 120) => zoom is min(680/200, 480/100) = 3.4, clamped to MAX_ZOOM.
      expect(camera.zoom).toBe(2.5);
      const screenCenter = camera.worldToScreen(200, 150); // rect's own center
      expect(screenCenter.x).toBeCloseTo(400);
      expect(screenCenter.y).toBeCloseTo(300);
    });

    it("pins the top-left corner instead of centering when the rect can't fit even at MIN_ZOOM", () => {
      const camera = new Camera(0, 0, 1);
      camera.frameRect({ x: 0, y: 0, width: 100_000, height: 100_000 }, 800, 600, 60);

      expect(camera.zoom).toBe(0.2);
      const screenTopLeft = camera.worldToScreen(0, 0);
      expect(screenTopLeft.x).toBeCloseTo(60);
      expect(screenTopLeft.y).toBeCloseTo(60);
    });

    it("is a no-op-safe default for a zero-size rect (a single node with no siblings)", () => {
      const camera = new Camera(0, 0, 1);
      expect(() => camera.frameRect({ x: 0, y: 0, width: 0, height: 0 }, 800, 600)).not.toThrow();
      expect(camera.zoom).toBe(2.5);
    });
  });
});
