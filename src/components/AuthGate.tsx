"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ensureTabSession, fetchAuthSettings } from "../client/authClient";

/** Client-side half of the "per tab" session scope (see server/models.ts's AuthSettings) — mounted
 * once at the app's root layout, so it runs once per tab's lifetime (client-side navigations don't
 * remount it). In "per browser" scope this is a no-op: the ordinary auth cookie already gates every
 * page via middleware.ts. In "per tab" scope, right after a fresh sign-in the cookie is still valid
 * for a brief moment — this exchanges it for a tab-scoped bearer token (see api/auth/tab-token) and
 * the server clears the cookie in that same response, so no *other* tab inherits the session. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || pathname?.startsWith("/login")) return;
    ran.current = true;
    void (async () => {
      const settings = await fetchAuthSettings();
      if (settings.sessionScope !== "tab") return;
      const ok = await ensureTabSession();
      if (!ok) router.replace(`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`);
    })();
  }, [pathname, router]);

  return <>{children}</>;
}
