-- Persist whether a workout is a MultiErg (row→ski→bike in one result) onto the
-- D1 summary table. mapResult derives it from the per-interval `machine` fields;
-- without this column every summary read back from D1 has is_multi_erg = 0, so
-- the replay page's "no MultiErg-vs-MultiErg ghost racing" fence (and any
-- summary-level MultiErg badge) is dead for real synced users.
ALTER TABLE workouts ADD COLUMN is_multi_erg INTEGER NOT NULL DEFAULT 0;
