import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { AiGraphApi } from "../../../src/graph/ai/AiGraphApi";
import { buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
});

describe("AiGraphApi concurrency + history", () => {
  it("bumps its version on every successful mutation and rejects a stale expectedVersion", () => {
    const api = new AiGraphApi(buildTestGraph());
    expect(api.version).toBe(0);

    const first = api.createNode({ nodeType: "debug.print" });
    expect(first.success).toBe(true);
    expect(api.version).toBe(1);

    const stale = api.applyChanges({ changes: [{ op: "create_node", nodeType: "debug.print" }], expectedVersion: 0 });
    expect(stale.success).toBe(false);
    expect(stale.errors[0].code).toBe("VERSION_CONFLICT");
    expect(api.version).toBe(1); // unchanged
  });

  it("succeeds when expectedVersion matches the current version", () => {
    const api = new AiGraphApi(buildTestGraph());
    const result = api.applyChanges({ changes: [{ op: "create_node", nodeType: "debug.print" }], expectedVersion: api.version });
    expect(result.success).toBe(true);
  });

  it("undo/redo round-trips a mutation through AiGraphApi", () => {
    const api = new AiGraphApi(buildTestGraph());
    api.createNode({ nodeType: "debug.print" });
    expect(api.getNodes()).toHaveLength(1);

    const undoResult = api.undo();
    expect(undoResult.success).toBe(true);
    expect(api.getNodes()).toHaveLength(0);

    const redoResult = api.redo();
    expect(redoResult.success).toBe(true);
    expect(api.getNodes()).toHaveLength(1);
  });

  it("creates and restores a snapshot", () => {
    const api = new AiGraphApi(buildTestGraph());
    const { snapshotId } = api.createSnapshot("before risky change");
    api.createNode({ nodeType: "debug.print" });
    expect(api.getNodes()).toHaveLength(1);

    const restore = api.restoreSnapshot(snapshotId);
    expect(restore.success).toBe(true);
    expect(api.getNodes()).toHaveLength(0);
  });

  it("dry-run apply_changes never advances the version", () => {
    const api = new AiGraphApi(buildTestGraph());
    const before = api.version;
    api.applyChanges({ changes: [{ op: "create_node", nodeType: "debug.print" }], dryRun: true });
    expect(api.version).toBe(before);
    expect(api.getNodes()).toHaveLength(0);
  });
});
