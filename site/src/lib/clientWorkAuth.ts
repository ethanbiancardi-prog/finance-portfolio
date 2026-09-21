import crypto from "crypto";

const DEFAULT_PASSCODE = "LolaBiancardi";
export const CLIENT_WORK_COOKIE = "client_work_session";

export function getExpectedPasscode(): string {
  return process.env.CLIENT_WORK_PASSCODE?.trim() || DEFAULT_PASSCODE;
}

/**
 * Generate a deterministic HMAC session token from the configured passcode.
 */
export function generateSessionToken(passcode: string): string {
  const salt = process.env.CLIENT_WORK_SECRET || "finance-portfolio-salt-2026";
  return crypto.createHmac("sha256", salt).update(passcode).digest("hex");
}

/**
 * Verifies if the user-submitted passcode matches the configured passcode.
 */
export function verifyPasscode(submitted: string): boolean {
  if (!submitted) return false;
  const expected = getExpectedPasscode();
  return submitted.trim() === expected;
}

/**
 * Checks if a session token matches the expected hash for the current passcode.
 */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const expectedToken = generateSessionToken(getExpectedPasscode());
  return token === expectedToken;
}

/**
 * Helper to check if the current request cookies contain a valid session token.
 */
export function isClientWorkAuthenticated(cookieStore: {
  get: (name: string) => { value: string } | undefined;
}): boolean {
  const cookie = cookieStore.get(CLIENT_WORK_COOKIE);
  return verifySessionToken(cookie?.value);
}
