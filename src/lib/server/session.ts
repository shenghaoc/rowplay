import type { Cookies } from "@sveltejs/kit";
import { sealToken, openToken } from "./tokenCrypto";

export interface SessionUser {
  id: number;
  username: string;
  firstName?: string;
}

export interface OAuthTokens {
  /**
   * OAuth access token. Empty for "bring your own token" (personal) sessions:
   * their credential is never stored server-side — it lives sealed in the
   * `rp_tok` cookie and is opened on demand (see `tokenCrypto.ts`).
   */
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scope: string;
}

export interface SessionData {
  user: SessionUser;
  tokens: OAuthTokens;
  /**
   * "Bring your own token" sessions: `tokens.accessToken` is intentionally
   * empty. The personal token lives sealed in `rp_tok` and is opened only
   * in memory for server-side Concept2 reads.
   */
  personal?: boolean;
  /** IANA home timezone for calendar/streak bucketing when workout tz is absent. */
  homeTimezone?: string;
}

export function getHomeTimezone(session: SessionData): string | undefined {
  const tz = session.homeTimezone?.trim();
  return tz || undefined;
}

export const SESSION_COOKIE = "rp_session";
export const OAUTH_STATE_COOKIE = "rp_oauth_state";
/**
 * Holds the athlete's personal token, sealed with `SESSION_SECRET`. httpOnly, so
 * it is never readable by client JS (BYOT privacy).
 */
export const TOKEN_COOKIE = "rp_tok";

/** Cookie options shared across session cookies. */
function cookieOpts(event: { url: URL }) {
  return {
    path: "/",
    httpOnly: true,
    secure: event.url.protocol === "https:",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };
}

/**
 * Seal session data into an encrypted cookie value using SESSION_SECRET.
 * The cookie is self-contained — no server-side storage needed.
 */
export async function sealSession(secret: string, data: SessionData): Promise<string> {
  return sealToken(secret, JSON.stringify(data));
}

/**
 * Open a session from an encrypted cookie value. Returns null if the cookie
 * is missing, tampered, or encrypted with a different secret.
 */
export async function openSession(secret: string, sealed: string): Promise<SessionData | null> {
  const json = await openToken(secret, sealed);
  if (!json) return null;
  try {
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Write session data to the encrypted cookie. Replaces any existing session.
 */
export async function writeSession(
  cookies: Cookies,
  event: { url: URL },
  secret: string,
  data: SessionData,
): Promise<string> {
  const sealed = await sealSession(secret, data);
  cookies.set(SESSION_COOKIE, sealed, cookieOpts(event));
  return sealed;
}

/**
 * Destroy the session by clearing the cookie.
 */
export function destroySession(cookies: Cookies, event: { url: URL }): void {
  cookies.delete(SESSION_COOKIE, cookieOpts(event));
}

/**
 * Set or clear the home timezone in the session cookie.
 */
export async function setHomeTimezone(
  cookies: Cookies,
  event: { url: URL },
  secret: string,
  session: SessionData,
  tz: string | undefined,
): Promise<void> {
  const next: SessionData = { ...session };
  if (tz?.trim()) next.homeTimezone = tz.trim();
  else delete next.homeTimezone;
  await writeSession(cookies, event, secret, next);
}
