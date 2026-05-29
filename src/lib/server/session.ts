import type { KVNamespace } from '@cloudflare/workers-types';

export interface SessionUser {
	id: number;
	username: string;
	firstName?: string;
}

export interface OAuthTokens {
	accessToken: string;
	refreshToken: string;
	/** Epoch milliseconds when the access token expires. */
	expiresAt: number;
	scope: string;
}

export interface SessionData {
	user: SessionUser;
	tokens: OAuthTokens;
}

const PREFIX = 'sess:';
/** Sessions live 30 days; refreshed on each use. */
const TTL_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE = 'rp_session';
export const OAUTH_STATE_COOKIE = 'rp_oauth_state';

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
