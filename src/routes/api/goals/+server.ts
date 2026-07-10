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
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    throw error(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw error(400, "Expected a JSON object.");
  }
  const {
    year: requestedYear,
    kind: requestedKind,
    target: requestedTarget,
  } = body as {
    year?: number;
    kind?: string;
    target?: number;
  };
  const year =
    typeof requestedYear === "number" && Number.isInteger(requestedYear) && requestedYear > 0
      ? requestedYear
      : new Date().getFullYear();
  if (requestedKind !== "meters" && requestedKind !== "hours") {
    throw error(400, 'Invalid goal kind. Must be "meters" or "hours".');
  }
  if (
    typeof requestedTarget !== "number" ||
    !Number.isFinite(requestedTarget) ||
    requestedTarget <= 0
  ) {
    throw error(400, "Invalid or missing target. Must be a positive number.");
  }
  const kind = requestedKind as AnnualGoalKind;
  const goal = { year, kind, target: requestedTarget };
  await saveAnnualGoal(event, goal);
  return json({ goal });
};
