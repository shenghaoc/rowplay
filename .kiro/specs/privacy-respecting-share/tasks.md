# Privacy-respecting share — tasks

- [x] 1. `isPubliclyShareable` predicate in `src/lib/privacy.ts` (fail closed; only `everyone` is public).
- [x] 2. Unit tests in `src/lib/privacy.test.ts` (allow `everyone`; block narrower / absent / unknown; normalise case + whitespace).
- [x] 3. `share.privacyBlocked` key in all six locales (`en, zh, de, es, fr, ja`).
- [x] 4. Guard in `createWorkoutShare` (demo + live paths) → HTTP 403 for non-public workouts; `publishWorkout` and the share endpoint inherit it.
- [x] 5. Surface the 403 as `share.privacyBlocked` in the replay share handler.
- [x] 6. Demo mock privacy values (`1002` = `private`; default `everyone`).
