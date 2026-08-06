import { SignJWT, jwtVerify } from "jose";

/** The bearer token minted for "per tab" session scope (see models.ts's AuthSettings) — a short-
 * lived, self-contained credential the client stores in sessionStorage instead of relying on the
 * ambient auth cookie, so each tab's authorization is independent (see AuthGate.tsx). Signed with
 * the same AUTH_SECRET next-auth itself uses; verifying it needs no DB/session-store lookup. */

const TAB_TOKEN_TTL_SECONDS = 12 * 60 * 60;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface TabTokenPayload {
  uid: string;
  email: string;
  name: string | null;
  provider: "entra" | "email";
  isAdmin: boolean;
}

export async function signTabToken(payload: TabTokenPayload): Promise<string> {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${TAB_TOKEN_TTL_SECONDS}s`).sign(secretKey());
}

export async function verifyTabToken(token: string): Promise<TabTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.uid !== "string" || typeof payload.email !== "string") return null;
    return {
      uid: payload.uid,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      provider: payload.provider === "entra" ? "entra" : "email",
      isAdmin: Boolean(payload.isAdmin),
    };
  } catch {
    return null;
  }
}
