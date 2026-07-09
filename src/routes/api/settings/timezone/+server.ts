import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadHomeTimezone, saveHomeTimezone } from "$lib/server/data";
import { TIMEZONE_VALUES } from "$lib/timezoneOptions";

export const GET: RequestHandler = async (event) => {
  const tz = await loadHomeTimezone(event);
  return json({ timezone: tz ?? null });
};

export const POST: RequestHandler = async (event) => {
  if (event.locals.demo) throw error(401, "Not authenticated.");
  const body = (await event.request.json()) as { timezone?: string };
  const tz = body.timezone?.trim();
  // Allow clearing the timezone (empty/undefined) or setting a valid IANA zone.
  if (tz && !TIMEZONE_VALUES.has(tz)) {
    throw error(400, "Invalid timezone.");
  }
  await saveHomeTimezone(event, tz || undefined);
  return json({ ok: true });
};
