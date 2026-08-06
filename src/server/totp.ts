import { Secret, TOTP } from "otpauth";

const ISSUER = "Hermione";

/** One-time setup: a fresh random secret plus the otpauth:// URI any authenticator app (Google
 * Authenticator, Authy, 1Password, ...) can scan/import — the user's own choice of app, per the
 * "per app" login option. The secret itself is stored server-side only after confirmVerify below
 * proves the user actually enrolled it (see DatabaseManager.setPendingUserTotpSecret). */
export function generateTotpEnrollment(email: string): { base32Secret: string; otpauthUri: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: ISSUER, label: email, algorithm: "SHA1", digits: 6, period: 30, secret });
  return { base32Secret: secret.base32, otpauthUri: totp.toString() };
}

/** Accepts a one-step drift on either side (±30s) to tolerate clock skew between the user's device
 * and this server, same as most TOTP implementations. */
export function verifyTotpCode(base32Secret: string, code: string): boolean {
  const totp = new TOTP({ issuer: ISSUER, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(base32Secret) });
  return totp.validate({ token: code, window: 1 }) !== null;
}
