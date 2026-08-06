import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "../../../../server/auth";
import { signTabToken } from "../../../../server/tabToken";

// Cookie names next-auth (Auth.js v5) uses for its JWT session, in both plain and secure-cookie
// (HTTPS, __Secure- prefixed) form — see https://authjs.dev/getting-started/session-management/cookies.
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

/** Called by AuthGate.tsx once, right after a successful sign-in, only when the "per tab" session
 * scope is active: exchanges the just-established cookie session for a bearer token the client
 * stores in sessionStorage, then immediately clears the cookie itself. From that point on this
 * browser has no ambient session left — every *other* tab (and any brand-new tab) is signed out
 * until it independently repeats this exchange (which requires signing in again, since the cookie
 * that would have let it skip that is gone). This is what makes "per tab" scope actually isolate
 * tabs, rather than merely duplicating the same shared session into sessionStorage too. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const token = await signTabToken({
    uid: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    provider: session.user.provider,
    isAdmin: session.user.isAdmin,
  });

  const cookieStore = await cookies();
  for (const name of SESSION_COOKIE_NAMES) cookieStore.delete(name);

  return NextResponse.json({ token });
}
