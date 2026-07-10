import type { RequestEvent } from "@sveltejs/kit";
import type { Concept2Config } from "./concept2";

/** Pulls the Concept2 OAuth config from the Cloudflare platform env. */
export function getConfig(event: RequestEvent): Concept2Config {
  const env = event.platform?.env;
  return {
    clientId: env?.CONCEPT2_CLIENT_ID ?? "",
    clientSecret: env?.CONCEPT2_CLIENT_SECRET ?? "",
    baseUrl: env?.CONCEPT2_BASE_URL || "https://log.concept2.com",
    appUrl: env?.PUBLIC_APP_URL || new URL(event.request.url).origin,
  };
}
