/** Tracks pause/resume state for one in-flight /api/simulate run, keyed by a server-generated runId
 * the client learns via the "run-start" SSE event (see route.ts) — a plain SSE response can't
 * itself receive more input from the client mid-stream, so pausing/resuming a run already in
 * progress goes through a separate POST to /api/simulate/control instead, which looks the run up
 * here by id. In-memory only: fine for this app's single-process, single-user local-tool deployment
 * model (the same one localStorage-based persistence already assumes) — not meant to survive a
 * server restart or scale across processes. */
class SimulationRun {
  private pauseRequested = false;
  private resumeWaiter: (() => void) | null = null;

  requestPause(): void {
    this.pauseRequested = true;
  }

  /** Wakes anything currently blocked in waitIfPaused, and also cancels a pending pauseRequested
   * that hasn't been checked yet — a Continue click always means "don't pause next either." */
  requestResume(): void {
    this.pauseRequested = false;
    const waiter = this.resumeWaiter;
    this.resumeWaiter = null;
    waiter?.();
  }

  /** Called at a node boundary (see route.ts's onNodeStart). `willPause` tells the caller whether
   * it's actually about to block (so it knows whether to emit its own "paused"/"resumed"
   * notifications) — `ready` resolves immediately if not, otherwise only once requestResume() is
   * called. */
  checkpoint(atBreakpoint: boolean): { willPause: boolean; ready: Promise<void> } {
    if (!atBreakpoint && !this.pauseRequested) return { willPause: false, ready: Promise.resolve() };
    this.pauseRequested = false; // consumed — a manual pause fires once, not on every future node
    return {
      willPause: true,
      ready: new Promise((resolve) => {
        this.resumeWaiter = resolve;
      }),
    };
  }
}

const runs = new Map<string, SimulationRun>();

export function registerSimulationRun(runId: string): void {
  runs.set(runId, new SimulationRun());
}

/** Releases anything still waiting on this run (so it can unwind instead of hanging forever) and
 * forgets it — called once the run's SSE stream actually ends, whether by finishing, erroring, or
 * the client aborting mid-pause. */
export function disposeSimulationRun(runId: string): void {
  runs.get(runId)?.requestResume();
  runs.delete(runId);
}

export function requestSimulationPause(runId: string): boolean {
  const run = runs.get(runId);
  run?.requestPause();
  return !!run;
}

export function requestSimulationResume(runId: string): boolean {
  const run = runs.get(runId);
  run?.requestResume();
  return !!run;
}

export function checkpointSimulation(runId: string, atBreakpoint: boolean): { willPause: boolean; ready: Promise<void> } {
  const run = runs.get(runId);
  return run ? run.checkpoint(atBreakpoint) : { willPause: false, ready: Promise.resolve() };
}
