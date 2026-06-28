## 2024-06-27 - Proper ARIA Controls Association
**Learning:** Found several components using `aria-expanded` (e.g. `PerformancePredictorCard`, `WorkoutListFilters`) but lacking `aria-controls` bindings to their collapsible panels. When `aria-expanded` is used on a button, it's crucial to pair it with `aria-controls` pointing to the `id` of the panel it opens/closes to give screen reader users context.
**Action:** Pair `aria-expanded` with `aria-controls` across toggles in the application for proper programmatic structure.
