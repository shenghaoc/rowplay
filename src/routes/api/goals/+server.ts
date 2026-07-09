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
  if (!body.year || !body.kind || !body.target) throw error(400, "Missing fields.");
  await saveAnnualGoal(event, {
    year: body.year,
    kind: body.kind as "meters" | "hours",
    target: body.target,
  });
  return json({ ok: true });
};
