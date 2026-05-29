-- Cached, fully-hydrated workout detail (summary + splits + per-stroke data).
CREATE TABLE IF NOT EXISTS workout_detail (
	user_id    INTEGER NOT NULL,
	workout_id INTEGER NOT NULL,
	payload    TEXT NOT NULL,
	cached_at  INTEGER NOT NULL,
	PRIMARY KEY (user_id, workout_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_detail_user ON workout_detail (user_id);
