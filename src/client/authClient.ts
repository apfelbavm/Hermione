import type { AuthSettings } from "../server/models";

// Client-side half of the "per tab vs per browser" session scope (see server/models.ts's
// AuthSettings and server/tabToken.ts). Only ever touches sessionStorage — never localStorage —
// since the whole point is that it does NOT survive/share across tabs. Exported so
// tabFetchPatch.ts's inline bootstrap script literal uses the exact same storage key.
export const TAB_TOKEN_KEY = "hermione:tabSessionToken";

export function getStoredTabToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TAB_TOKEN_KEY);
}

export function setStoredTabToken(token: string): void {
  window.sessionStorage.setItem(TAB_TOKEN_KEY, token);
}

export function clearStoredTabToken(): void {
  window.sessionStorage.removeItem(TAB_TOKEN_KEY);
}

export async function fetchAuthSettings(): Promise<AuthSettings> {
  const res = await fetch("/api/auth/settings");
  if (!res.ok) return { sessionScope: "browser" };
  return (await res.json()) as AuthSettings;
}

/** Exchanges the current cookie session for a tab-scoped bearer token (see
 * api/auth/tab-token/route.ts) — returns true if this tab now has a valid session (either it
 * already had a stored token, or the exchange succeeded), false if the visitor needs to sign in. */
export async function ensureTabSession(): Promise<boolean> {
  if (getStoredTabToken()) return true;
  const res = await fetch("/api/auth/tab-token", { method: "POST" });
  if (!res.ok) return false;
  const { token } = (await res.json()) as { token: string };
  setStoredTabToken(token);
  return true;
}
