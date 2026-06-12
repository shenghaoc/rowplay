import type { PageServerLoad } from "./$types";
import { firstRunEligible } from "$lib/firstRun";

export const load: PageServerLoad = async (event) => {
  return {
    firstRunEligible: firstRunEligible(event.locals.demo, event.locals.user),
  };
};
