## 2026-05-30 - Optimize powerCurve with sliding window
**Learning:** Using binary search inside a loop over time series data (O(N log N)) can often be optimized to a sliding window (O(N)) when both the start and target values monotonically increase.
**Action:** Look for nested lookups or binary searches in sequential data and replace them with two-pointer/sliding window techniques.

## 2026-05-30 - Optimize intervalBreakdown with two pointers
**Learning:** Nested loops where the inner loop does a linear lookup (e.g. `findIndex`) on sorted time boundaries inside a sequential time series array lead to an O(N*M) bottleneck.
**Action:** When mapping time series elements (like strokes) into contiguous chronological buckets (like intervals), replace the inner lookup with an O(N) two-pointer / sliding window technique.

## 2026-05-31 - Avoid closures in high-frequency loops
**Learning:** `Array.prototype.find` (and similar iterator methods) creates a new closure object on every call. When used inside a hot loop traversing long time-series arrays (like parsing every stroke of a long workout), this leads to significant, unnecessary garbage collection overhead.
**Action:** Replace `find`, `filter`, or `map` with simple `for` loops inside high-frequency iteration blocks.
