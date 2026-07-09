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
  await saveHomeTimezone(event, body.timezone || undefined);
  return json({ ok: true });
};
