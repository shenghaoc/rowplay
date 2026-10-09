import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Share feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Sharing is no longer available.");
};
