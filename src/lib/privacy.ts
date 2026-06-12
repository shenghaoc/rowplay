// Concept2 logbook `privacy` levels (the result's `privacy` field): only
// `everyone` makes a workout publicly visible; `logged_in`, `partners`, and
// `private` are progressively narrower.
const PUBLIC_PRIVACY = "everyone";

/**
 * Whether a workout may be exposed through a public rowplay share link.
 *
 * Fail closed: a public link is allowed ONLY when the Concept2 `privacy` value
 * is exactly `everyone`. Narrower levels (`logged_in`, `partners`, `private`)
 * and any absent or unrecognised value are treated as non-public, so rowplay
 * never silently overrides the athlete's stated privacy preference.
 */
export function isPubliclyShareable(privacy?: string | null): boolean {
  return privacy?.trim().toLowerCase() === PUBLIC_PRIVACY;
}
