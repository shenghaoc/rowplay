import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadAnnualGoal, saveAnnualGoal } from "$lib/server/data";

export const GET: RequestHandler = async (event) => {
  const year = Number(event.url.searchParams.get("year")) || new Date().getFullYear();
  const goal = await loadAnnualGoal(event, year);
  return json(goal);
};

export const POST: RequestHandler = async (event) => {
  if (event.locals.demo) throw error(401, "Not authenticated.");
  const body = (await event.request.json()) as { year?: number; kind?: string; target?: number };
  if (typeof body.year !== "number" || !Number.isInteger(body.year)) {
    throw error(400, "Invalid or missing year.");
  }
  if (body.kind !== "meters" && body.kind !== "hours") {
    throw error(400, 'Invalid goal kind. Must be "meters" or "hours".');
  }
  if (typeof body.target !== "number" || body.target <= 0) {
    throw error(400, "Invalid or missing target. Must be a positive number.");
  }
  await saveAnnualGoal(event, {
    year: body.year,
    kind: body.kind,
    target: body.target,
  });
  return json({ ok: true });
};
