import { auth } from "./auth";
import { verifyTabToken, type TabTokenPayload } from "./tabToken";

/** The one place API routes ask "who is calling?" — works whether this browser is using a normal
 * cookie session ("browser" scope) or an Authorization: Bearer tab token ("tab" scope), so route
 * handlers never need to know which scope is active (see models.ts's AuthSettings). */
export async function getRequestUser(req: Request): Promise<TabTokenPayload | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyTabToken(authHeader.slice("Bearer ".length));
  }
  const session = await auth();
  if (!session?.user) return null;
  return { uid: session.user.id, email: session.user.email ?? "", name: session.user.name ?? null, provider: session.user.provider, isAdmin: session.user.isAdmin };
}
