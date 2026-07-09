import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Account deletion feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Account deletion is no longer available. No server-side data is stored.");
};
