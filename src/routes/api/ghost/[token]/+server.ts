import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Ghost/share feature removed — no persistent storage for share tokens. */
export const GET: RequestHandler = async () => {
  throw error(410, "Ghost data is no longer available. Sharing has been removed.");
};
