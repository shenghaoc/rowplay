## 2026-05-30 - Optimize powerCurve with sliding window

**Learning:** Using binary search inside a loop over time series data (O(N log N)) can often be optimized to a sliding window (O(N)) when both the start and target values monotonically increase.
**Action:** Look for nested lookups or binary searches in sequential data and replace them with two-pointer/sliding window techniques.

## 2026-05-30 - Optimize intervalBreakdown with two pointers

**Learning:** Nested loops where the inner loop does a linear lookup (e.g. `findIndex`) on sorted time boundaries inside a sequential time series array lead to an O(N\*M) bottleneck.
**Action:** When mapping time series elements (like strokes) into contiguous chronological buckets (like intervals), replace the inner lookup with an O(N) two-pointer / sliding window technique.

## 2026-05-31 - Avoid closures in high-frequency loops

**Learning:** `Array.prototype.find` (and similar early-exit iterator methods) creates a new closure object on every call. When used inside a hot loop traversing long time-series arrays (like parsing every stroke of a long workout), this leads to unnecessary garbage collection overhead.
**Action:** Replace `find` with a `for...of` loop **only when the containing function is called in a tight inner loop** (e.g., per-stroke in a thousands-of-strokes traversal). Do not apply this to `filter` or `map` outside hot paths — replacing readable functional style there is a readability regression for no gain.

## 2026-06-03 - Optimize analytics loops and avoid map/reduce closures

**Learning:** Chaining `.map()`, `.filter()`, and `.reduce()` inside analytics functions (like `techniqueSummary`) that process high-frequency time series (e.g., thousands of stroke objects) creates numerous closures and intermediate arrays. This results in significant garbage collection overhead and O(N) execution time with a large constant factor.
**Action:** When computing multi-step metrics over time series arrays, replace functional `.map()/.reduce()` chains with traditional `for` loops that compute aggregations (sums, averages, variances) directly in a single pass without allocating intermediate memory.

## 2026-06-07 - Avoid array allocations in workoutSideStats

**Learning:** The `Math.max(...array.map())` pattern allocates intermediate arrays and risks `RangeError: Maximum call stack size exceeded` on very large arrays. Chaining array methods like `.map(...).filter(...)` on large time series data creates several short-lived arrays resulting in GC pressure.
**Action:** Use single-pass `for` loops for calculating metrics on large arrays to avoid intermediate memory allocations and stack size limits.

## 2026-06-08 - Avoid array allocations in analytics functions

**Learning:** Chaining array methods like `.map().filter()` or `.reduce()` combined with `.map()` and spread syntax (`Math.max(...array)`) over large history arrays (e.g. all workouts) causes similar GC pressure and risk of stack overflow on large profiles.
**Action:** Use single-pass `for` loops for aggregation or filtering over large unpaginated top-level arrays (like an athlete's entire history) rather than array methods.

## 2026-06-15 - Replace spread Math.max on derived calculations

**Learning:** Spread syntax `Math.max(...array)` on dynamically mapped values inside reactive `$derived` blocks risks `Maximum call stack size exceeded` for large datasets and incurs unneeded allocation overhead.
**Action:** Replace map/filter chains and array spreading inside reactive calculations with explicit single-pass `for` loops, adding inline explanations to clarify the performance optimization over built-ins.

## 2026-06-21 - Optimize workRestEfficiency with single-pass loops

**Learning:** Chaining `.filter()`, `.reduce()`, and `.map()` to extract multiple metrics from the same array causes O(N\*M) traversals and garbage collection pressure.
**Action:** Consolidate multiple metrics calculations into a single `for` loop to avoid intermediate memory allocations and redundant iterations.

## 2026-06-25 - Avoid map/slice chains in analytics interval processing

**Learning:** Using multiple intermediate array operations like `.slice(0, third).map(...)` or `mean(bucket.map(...))` inside a `.map()` loop (like `intervalBreakdown`'s splits processing) causes significant allocation overhead and multiple loop iterations over the same data.
**Action:** Replace `.map()` and `.slice().map()` chains with single-pass `for` loops inside outer mapping loops to avoid allocating intermediate arrays and reduce GC pressure.

## 2024-06-13 - Avoid filter and reduce in hot paths

**Learning:** `Array.prototype.filter` followed by `Array.prototype.reduce` in inner loops (e.g., iterating through multiple targets for grouped sets) creates significant garbage collection overhead by allocating intermediate arrays.
**Action:** Replace `filter` + `reduce` chains inside hot loops with a single loop tracking the optimal value, avoiding any intermediate object/array allocations.

## 2026-06-14 - Replace spread Math.max on array map with explicit loop

**Learning:** Spread syntax `Math.max(...array.map())` allocates an intermediate array using `.map` and places all of its elements onto the call stack via the spread operator `...`, which risks `Maximum call stack size exceeded` for large datasets and incurs unneeded allocation overhead.
**Action:** Replace map chains and array spreading `Math.max(...array.map())` or `Math.max(...array)` with explicit single-pass `for` loops tracking the maximum value. Ensure to add comments explaining the optimization.

## 2026-06-16 - Avoid array method chains in hot loops

**Learning:** Using chained array methods like `.slice().map().filter()` inside sliding window calculations over large time-series data generates many intermediate arrays and causes high garbage collection pressure.
**Action:** Replace map/filter chains with single-pass `for` loops to directly accumulate values without creating temporary arrays.

## 2024-06-25 - Avoid chained array methods in statistical functions

**Learning:** Using `.map()` chained with `.reduce()` for mathematical accumulations (like calculating sums or slopes) creates redundant array allocations and multiple passes over the same dataset. This wastes memory and increases GC pressure, especially on large analytic calculations like linear trends or critical power estimation.
**Action:** Replace `xs.map().reduce()` logic inside analytic or statistical routines with single-pass `for` loops directly calculating the accumulated sum (e.g. `sumX`, `sumY`).

## 2026-06-18 - Optimize merge/interval operations using a sliding window

**Learning:** Using chained array operations like `.filter().map().filter()` combined with `.reduce()` within a loop over sequential boundaries (e.g. splits mapping to strokes) leads to O(N\*M) time complexity and massive intermediate array allocation overhead.
**Action:** When aggregating sequential, monotonically increasing time-series data (like strokes and distance boundaries), replace nested array methods with a single-pass sliding window (two-pointer) `for` loop to entirely prevent array allocations and maintain O(N+M) complexity.

## 2026-06-21 - Avoid chained array methods in DPS trend computation

**Learning:** Using chained `.filter()` and `.map()` calls on large time-series data (like calculating DPS trends for all workouts) creates multiple intermediate arrays, causing significant garbage collection overhead and memory pressure.
**Action:** Replace map/filter chains with explicit `for` loops that filter and accumulate values in one traversal, avoiding extra intermediate arrays and object copies.

## 2024-06-21 - Optimize chained array allocations for medians and averages

**Learning:** Using chained array operations like `.map().filter()` or array extractions inside `median(array.map(...))` results in unnecessary memory allocations when processing arrays of arbitrary sizes.
**Action:** Replace map/filter chains with explicit single-pass `for` loops avoiding intermediate array creation to reduce garbage collection pressure.

## 2024-07-25 - Avoid chained array methods when iterating over large datasets

**Learning:** Using chained `.filter()` and `.map()` calls when iterating over large datasets, such as a user's entire `workouts` history, creates intermediate arrays that increase garbage collection overhead.
**Action:** Replace map/filter chains with explicit `for` loops that filter and accumulate values in a single pass to reduce memory allocations and improve iteration performance.
