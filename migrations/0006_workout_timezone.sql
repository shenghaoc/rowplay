-- Persist the per-workout IANA timezone (Concept2 result `timezone`) onto the
-- D1 summary table so the dashboard read path can bucket each workout by the
-- day it actually happened. Without this column `w.timezone` is always
-- undefined for synced users and the timezone-correct calendar's most-accurate
-- path never activates.
ALTER TABLE workouts ADD COLUMN timezone TEXT;
