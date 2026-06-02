import type { KVNamespace } from '@cloudflare/workers-types';

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
	 * "Bring your own token" sessions: `tokens.accessToken` is a long-lived
	 * personal API token the user pasted, used directly with no OAuth refresh.
	 */
	personal?: boolean;
}

const PREFIX = 'sess:';
/** Sessions live 30 days; refreshed on each use. */
const TTL_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE = 'rp_session';
export const OAUTH_STATE_COOKIE = 'rp_oauth_state';
/**
 * Holds the athlete's personal token, sealed with `SESSION_SECRET`. httpOnly, so
 * it is never readable by client JS and never stored in KV/D1 (BYOT privacy).
 */
export const TOKEN_COOKIE = 'rp_tok';

export function newSessionId(): string {
	return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

export async function readSession(kv: KVNamespace, id: string): Promise<SessionData | null> {
	const raw = await kv.get(PREFIX + id);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SessionData;
	} catch {
		return null;
	}
}

export async function writeSession(kv: KVNamespace, id: string, data: SessionData): Promise<void> {
	await kv.put(PREFIX + id, JSON.stringify(data), { expirationTtl: TTL_SECONDS });
}

export async function destroySession(kv: KVNamespace, id: string): Promise<void> {
	await kv.delete(PREFIX + id);
}
