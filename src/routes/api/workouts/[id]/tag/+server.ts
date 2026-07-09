import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Workout tag feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Workout tags are no longer available.");
};
