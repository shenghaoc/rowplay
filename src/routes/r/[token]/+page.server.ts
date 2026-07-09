import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Share link feature removed — redirect to home. */
export const load: PageServerLoad = async () => {
  throw redirect(303, "/");
};
