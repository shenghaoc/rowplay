import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createWorkoutShare } from "$lib/server/share";

export const POST: RequestHandler = async (event) => {
  const id = Number(event.params.id);
  if (!Number.isFinite(id)) throw error(400, "Invalid workout id.");
  const share = await createWorkoutShare(event, id);
  return json(share, { headers: { "cache-control": "private, no-store" } });
};
