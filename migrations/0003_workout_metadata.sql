-- Workout summaries gained HR min/max and watt-minutes (from the full result
-- metadata). Add the columns so these round-trip through the D1 summary table
-- rather than being dropped on sync.
ALTER TABLE workouts ADD COLUMN hr_min INTEGER;
ALTER TABLE workouts ADD COLUMN hr_max INTEGER;
ALTER TABLE workouts ADD COLUMN watt_minutes INTEGER;
