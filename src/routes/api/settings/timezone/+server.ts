import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadHomeTimezone, saveHomeTimezone } from "$lib/server/data";

export const GET: RequestHandler = async (event) => {
  const tz = await loadHomeTimezone(event);
  return json({ timezone: tz ?? null });
};

export const POST: RequestHandler = async (event) => {
  if (event.locals.demo) throw error(401, "Not authenticated.");
  const body = (await event.request.json()) as { timezone?: string };
  const tz = body.timezone?.trim() || undefined;
  // Validate the timezone string using the runtime's Intl implementation.
  // This accepts any valid IANA timezone and rejects garbage like "asdf".
  if (tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw error(400, "Invalid timezone.");
    }
  }
  await saveHomeTimezone(event, tz);
  return json({ ok: true });
};
