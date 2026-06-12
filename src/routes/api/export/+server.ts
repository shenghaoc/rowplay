import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadWorkouts } from "$lib/server/data";
import { exportFilename, workoutsToCsv, workoutsToJson } from "$lib/server/export";

export const GET: RequestHandler = async (event) => {
  const format = new URL(event.request.url).searchParams.get("format") ?? "json";
  const workouts = await loadWorkouts(event);
  if (!workouts.length) throw error(404, "No workouts to export.");

  if (format === "csv") {
    const body = workoutsToCsv(workouts);
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename("csv")}"`,
        "cache-control": "private, no-store",
      },
    });
  }
  if (format === "json") {
    const body = workoutsToJson(workouts);
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename("json")}"`,
        "cache-control": "private, no-store",
      },
    });
  }
  throw error(400, "Unsupported format. Use csv or json.");
};
