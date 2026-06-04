-- Athlete override for auto-detected workout type tags (NULL = auto-detect).
ALTER TABLE workouts ADD COLUMN user_tag TEXT;
