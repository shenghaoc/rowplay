import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadAnnualGoal, saveAnnualGoal } from "$lib/server/data";
import type { AnnualGoalKind } from "$lib/analytics";

export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get("year");
  const parsed = raw == null ? NaN : Number(raw);
  const year = Number.isInteger(parsed) && parsed > 0 ? parsed : new Date().getFullYear();
  const goal = await loadAnnualGoal(event, year);
  return json(goal);
};

export const PUT: RequestHandler = async (event) => {
  let body: { year?: number; kind?: string; target?: number };
  try {
    body = (await event.request.json()) as { year?: number; kind?: string; target?: number };
  } catch {
    throw error(400, "Invalid JSON body.");
  }
  const year =
    typeof body.year === "number" && Number.isInteger(body.year) && body.year > 0
      ? body.year
      : new Date().getFullYear();
  if (body.kind !== "meters" && body.kind !== "hours") {
    throw error(400, 'Invalid goal kind. Must be "meters" or "hours".');
  }
  if (typeof body.target !== "number" || !Number.isFinite(body.target) || body.target <= 0) {
    throw error(400, "Invalid or missing target. Must be a positive number.");
  }
  const kind = body.kind as AnnualGoalKind;
  const goal = { year, kind, target: body.target };
  await saveAnnualGoal(event, goal);
  return json({ goal });
};
