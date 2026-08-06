import type { DefaultSession } from "next-auth";
import type { UserRole } from "../server/models";

// Augments next-auth's built-in types with the extra fields server/auth.ts's callbacks attach —
// keeps every `session.user.*`/`token.*` access elsewhere in the app type-checked.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      provider: "entra" | "email";
      role: UserRole;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    provider?: "entra" | "email";
    role?: UserRole;
    isAdmin?: boolean;
  }
}
