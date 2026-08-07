import { NextResponse } from "next/server";
import { auth } from "@hermione/core/server/auth";
import { verifyTabToken } from "@hermione/core/server/tabToken";

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Gates every page and API route in the app except the ones above. Accepts EITHER a valid next-auth
// cookie session (req.auth, set below by wrapping with `auth(...)`) OR a valid Authorization: Bearer
// tab token (see server/tabToken.ts) — which credential a given request carries depends on the
// admin-controlled session scope (models.ts's AuthSettings), but this proxy doesn't need to
// branch on that itself, since either one alone already proves who's asking.
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (req.auth?.user) return NextResponse.next();

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && (await verifyTabToken(authHeader.slice("Bearer ".length)))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.png|favicon.ico).*)"],
};
