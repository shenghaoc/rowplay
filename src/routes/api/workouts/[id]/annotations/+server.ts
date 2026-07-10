import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Annotations feature removed — no persistent storage. */
export const GET: RequestHandler = async () => {
  throw error(410, "Annotations are no longer available.");
};

export const POST: RequestHandler = async () => {
  throw error(410, "Annotations are no longer available.");
};

export const PUT: RequestHandler = async () => {
  throw error(410, "Annotations are no longer available.");
};

export const DELETE: RequestHandler = async () => {
  throw error(410, "Annotations are no longer available.");
};
