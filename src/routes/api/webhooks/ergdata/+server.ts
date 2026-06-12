import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * ErgData webhook stub — validates signature when ERGDATA_WEBHOOK_SECRET is set.
 * Full integration deferred until ErgData publishes a stable webhook API.
 */
export const POST: RequestHandler = async (event) => {
  const secret = event.platform?.env?.ERGDATA_WEBHOOK_SECRET;
  if (!secret) {
    throw error(501, "ErgData webhooks are not configured on this deployment.");
  }

  const sig = event.request.headers.get("x-ergdata-signature");
  const body = await event.request.text();
  if (!sig || !(await validHmac(secret, body, sig))) {
    throw error(401, "Invalid webhook signature.");
  }

  let payload: { workoutId?: number };
  try {
    payload = JSON.parse(body) as { workoutId?: number };
  } catch {
    throw error(400, "Invalid JSON body.");
  }

  if (payload.workoutId == null) {
    throw error(400, "Missing workoutId.");
  }

  // Future: fetch workout detail via Concept2 API and upsert into D1.
  return json({ ok: true, queued: payload.workoutId });
};

async function validHmac(secret: string, body: string, provided: string): Promise<boolean> {
  const hex = provided.replace(/^sha256=/, "");
  // Expected HMAC-SHA-256 hex is always 64 chars — a length guard is safe here.
  if (hex.length !== 64) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
}
