import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** HR import feature removed — no persistent storage. */
export const POST: RequestHandler = async () => {
  throw error(410, "Heart rate import is no longer available.");
};

export const DELETE: RequestHandler = async () => {
  throw error(410, "Heart rate import is no longer available.");
};
