import type { KVNamespace, D1Database, Fetcher } from '@cloudflare/workers-types';
import type { SessionUser } from '$lib/server/session';

declare global {
	namespace App {
		interface Locals {
			/** Authenticated logbook user, or null when not logged in / demo mode. */
			user: SessionUser | null;
			/** Opaque session id stored in the cookie. */
			sessionId: string | null;
			/** True when running without Concept2 credentials (serves mock data). */
			demo: boolean;
		}
		interface PageData {
			user: SessionUser | null;
			demo: boolean;
		}
		interface Platform {
			env: {
				/** Static-asset server binding (Workers assets). */
				ASSETS: Fetcher;
				SESSIONS: KVNamespace;
				DB: D1Database;
				CONCEPT2_CLIENT_ID: string;
				CONCEPT2_CLIENT_SECRET: string;
				/** When set, only this Concept2 user id may authenticate (single-user lock). */
				CONCEPT2_ALLOWED_USER_ID: string;
				CONCEPT2_BASE_URL: string;
				PUBLIC_APP_URL: string;
				SESSION_SECRET: string;
			};
		}
	}
}

export {};
