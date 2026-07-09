import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Leaderboard feature removed — redirect to dashboard. */
export const load: PageServerLoad = async () => {
  throw redirect(303, "/dashboard");
};
