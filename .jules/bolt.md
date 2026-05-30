## 2025-02-05 - Optimize powerCurve with sliding window
**Learning:** Using binary search inside a loop over time series data (O(N log N)) can often be optimized to a sliding window (O(N)) when both the start and target values monotonically increase.
**Action:** Look for nested lookups or binary searches in sequential data and replace them with two-pointer/sliding window techniques.
