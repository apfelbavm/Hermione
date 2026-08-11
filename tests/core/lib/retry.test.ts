import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@hermione/core/lib/retry";

describe("withRetry", () => {
  it("returns immediately on first success without waiting", async () => {
    const fn = vi.fn(async () => ({ success: true, value: 1 }));
    const result = await withRetry(fn, 3, 1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, value: 1, attempts: 1 });
  });

  it("retries up to retryCount extra times then gives up, reporting the last result", async () => {
    const fn = vi.fn(async () => ({ success: false, error: "boom" }));
    const result = await withRetry(fn, 2, 0);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: false, error: "boom", attempts: 3 });
  });

  it("stops retrying as soon as a later attempt succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      return calls < 3 ? { success: false, error: "not yet" } : { success: true, error: "" };
    });
    const result = await withRetry(fn, 5, 0);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: true, error: "", attempts: 3 });
  });

  it("waits retryDelayMs * attempt between attempts (linear backoff)", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => ({ success: false }));
    const promise = withRetry(fn, 2, 100);

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    await promise;
    vi.useRealTimers();
  });

  it("never calls fn when retryCount is 0 beyond the single attempt", async () => {
    const fn = vi.fn(async () => ({ success: false }));
    await withRetry(fn, 0, 1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
