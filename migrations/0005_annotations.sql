-- Coaching annotations — timestamped notes on workouts.
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  workout_id INTEGER NOT NULL,
  timestamp REAL NOT NULL,  -- seconds since workout start (matches Stroke.t)
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,  -- epoch ms
  FOREIGN KEY (user_id, workout_id) REFERENCES workouts(user_id, workout_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_annotations_workout ON annotations(user_id, workout_id, timestamp);
