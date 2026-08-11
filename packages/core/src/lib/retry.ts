export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared retry loop for any Manager call that never throws and instead reports failure via a
 * `{success: false}` result (every *Manager class in this directory follows that contract). Retries
 * up to `retryCount` extra times with linear backoff (attempt N waits retryDelayMs * N ms), mirroring
 * WebhookManager.send's original loop. Returns the last result plus how many attempts were made. */
export async function withRetry<T extends { success: boolean }>(fn: () => Promise<T>, retryCount: number, retryDelayMs: number): Promise<T & { attempts: number }> {
  const maxAttempts = Math.max(0, Math.round(retryCount)) + 1;
  const delayBase = Math.max(0, Math.round(retryDelayMs));

  let result: T;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await fn();
    if (result.success || attempt === maxAttempts) return { ...result, attempts: attempt };
    await delay(delayBase * attempt);
  }
  return { ...result!, attempts: maxAttempts };
}
