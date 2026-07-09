import type { Fetcher, ExecutionContext } from "@cloudflare/workers-types";
import type { SessionUser } from "$lib/server/session";
import type { Language } from "$lib/i18n";

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare global {
  namespace App {
    interface Locals {
      /** Authenticated logbook user, or null when not logged in / demo mode. */
      user: SessionUser | null;
      /** True when running without Concept2 credentials (serves mock data). */
      demo: boolean;
      /**
       * True for a "bring your own token" session (token sealed in a cookie).
       */
      personal: boolean;
      /** UI language, resolved from the `lang` cookie (default en). */
      lang: Language;
      /** UI theme, resolved from the `theme` cookie (default light). */
      theme: "light" | "dark";
    }
    interface PageData {
      user: SessionUser | null;
      demo: boolean;
    }
    interface Platform {
      env: {
        /** Static-asset server binding (Workers assets). */
        ASSETS: Fetcher;
        CONCEPT2_CLIENT_ID: string;
        CONCEPT2_CLIENT_SECRET: string;
        CONCEPT2_BASE_URL: string;
        PUBLIC_APP_URL: string;
        SESSION_SECRET: string;
        /** Optional — enables ErgData webhook signature validation. */
        ERGDATA_WEBHOOK_SECRET?: string;
      };
      /** Cloudflare execution context — `waitUntil` keeps background work
       *  alive past the response. */
      context: ExecutionContext;
    }
  }
}

export {};
