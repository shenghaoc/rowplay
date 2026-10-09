import { withJsonContentLength } from "#lib/server/jsonResponse.ts";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadWorkoutDetail } from "#lib/server/data.ts";

export const GET: RequestHandler = async (event) => {
  const id = Number(event.params.id);
  if (!Number.isFinite(id)) throw error(400, "Invalid workout id.");
  const detail = await loadWorkoutDetail(event, id);
  return withJsonContentLength(
    Response.json(detail, { headers: { "cache-control": "private, no-store" } }),
  );
};
