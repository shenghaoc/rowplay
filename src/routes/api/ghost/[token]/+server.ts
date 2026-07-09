import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Ghost/share feature removed — no persistent storage for share tokens. */
export const GET: RequestHandler = async () => {
  throw error(404, "Ghost data not found. Sharing is no longer available.");
};
