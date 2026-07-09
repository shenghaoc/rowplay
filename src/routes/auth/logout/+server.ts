import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { destroySession, TOKEN_COOKIE } from "$lib/server/session";

export const POST: RequestHandler = async (event) => {
  destroySession(event.cookies, event);
  event.cookies.delete(TOKEN_COOKIE, { path: "/" });
  throw redirect(303, "/");
};
