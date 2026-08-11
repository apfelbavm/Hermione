import type { PinDef } from "@hermione/graph/engine/types";
import { i18n } from "@i18n";

/** Standard retry/attempts pins shared by every Manager-backed node (see packages/core/src/lib/retry.ts's
 * withRetry) — mirrors webhook.send's original retryCount/retryDelayMs/attempts pins so the whole graph
 * uses one consistent naming convention. */
export function retryCountPin(): PinDef {
  return { id: "retryCount", label: i18n.nodes.__shared.pin_retry_count, type: "number", direction: "input", defaultValue: 0, integer: true };
}

export function retryDelayMsPin(): PinDef {
  return { id: "retryDelayMs", label: i18n.nodes.__shared.pin_retry_delay_ms, type: "number", direction: "input", defaultValue: 1000, integer: true };
}

export function attemptsPin(): PinDef {
  return { id: "attempts", label: i18n.nodes.__shared.pin_attempts, type: "number", direction: "output" };
}
