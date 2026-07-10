import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { destroySession, TOKEN_COOKIE } from "$lib/server/session";

export const POST: RequestHandler = async (event) => {
  destroySession(event.cookies, event);
  // Match the options used when setting the cookie so the browser clears it.
  event.cookies.delete(TOKEN_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: event.url.protocol === "https:",
    sameSite: "lax",
  });
  throw redirect(303, "/");
};
