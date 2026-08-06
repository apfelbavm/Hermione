import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { getDatabaseManager } from "./DatabaseManager";
import { verifyTotpCode } from "./totp";

/** Emails in this list become admins (able to manage the domain allowlist and session-scope
 * setting under /admin/security) on their next sign-in — see DatabaseManager.upsertUserFromLogin.
 * There's no in-app "grant admin" UI on purpose: it's a deployment-level decision, made by whoever
 * controls the server's env vars, not by another admin inside the app. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.AUTH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    // Internal/trusted sign-in — no domain allowlist check, the tenant itself is the boundary.
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
    // External-company sign-in, gated by the allowed-domains list — one-time code emailed to them.
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: { email: {}, code: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const code = String(credentials?.code ?? "").trim();
        if (!email || !code) return null;
        const db = getDatabaseManager();
        if (!db.isEmailDomainAllowed(email)) return null;
        if (!db.verifyAndConsumeEmailLoginCode(email, code)) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
    // Same allowlist gate, but verified against a TOTP secret the user enrolled themselves (see
    // /account/security) with their own authenticator app instead of a fresh emailed code.
    Credentials({
      id: "email-totp",
      name: "Authenticator app",
      credentials: { email: {}, code: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const code = String(credentials?.code ?? "").trim();
        if (!email || !code) return null;
        const db = getDatabaseManager();
        if (!db.isEmailDomainAllowed(email)) return null;
        const user = db.getUserByEmail(email);
        const secret = user?.totpEnabled ? db.getUserTotpSecret(email) : undefined;
        if (!secret || !verifyTotpCode(secret, code)) return null;
        return { id: email, email, name: user?.name ?? email.split("@")[0] };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const provider = account?.provider === "microsoft-entra-id" ? "entra" : "email";
      if (provider === "email" && !getDatabaseManager().isEmailDomainAllowed(email)) return false;
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const email = user.email?.toLowerCase();
        if (!email) return token;
        const provider = account.provider === "microsoft-entra-id" ? "entra" : "email";
        const dbUser = getDatabaseManager().upsertUserFromLogin(email, user.name ?? null, provider, adminEmails().has(email));
        token.uid = dbUser.id;
        token.email = dbUser.email;
        token.name = dbUser.name ?? undefined;
        token.provider = dbUser.provider;
        token.isAdmin = dbUser.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? "");
        session.user.provider = token.provider === "entra" ? "entra" : "email";
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
