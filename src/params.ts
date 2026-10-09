import { defineParams } from "@sveltejs/kit/params";

export const params = defineParams({
  // Coerce only: rejecting here would replace endpoint-specific 400 errors with routing 404s.
  workoutId: (value: string) => Number(value),
});
