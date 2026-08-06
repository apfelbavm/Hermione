/** Shared between src/server/DatabaseManager.ts (enforces the cap) and the Webhooks page (states it
 * in the UI) — mirrors runLogConstants.ts's MAX_RUNS_PER_PROJECT pattern. */
export const MAX_WEBHOOK_DELIVERIES_PER_FLOW = 50;
