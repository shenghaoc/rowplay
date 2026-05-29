-- Per-session workout summaries, synced from the Concept2 logbook so analytics
-- (PBs, trends, breakdowns, totals) run over the user's ENTIRE history rather
-- than just the most recent API page.
CREATE TABLE IF NOT EXISTS workouts (
	user_id       INTEGER NOT NULL,
	workout_id    INTEGER NOT NULL,
	date          TEXT NOT NULL,       -- "YYYY-MM-DD HH:MM:SS"
	sport         TEXT NOT NULL,       -- rower | skierg | bike
	distance      INTEGER NOT NULL,    -- metres
	time          REAL NOT NULL,       -- seconds
	pace          REAL NOT NULL,       -- sec / 500m
	stroke_rate   INTEGER,
	stroke_count  INTEGER,
	heart_rate    INTEGER,
	calories      INTEGER,
	drag_factor   INTEGER,
	workout_type  TEXT,
	comments      TEXT,
	has_stroke    INTEGER NOT NULL DEFAULT 0,  -- 0/1
	PRIMARY KEY (user_id, workout_id)
);

-- Newest-first listing and date-range filtering per user.
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts (user_id, date DESC);
-- Sport-scoped queries (per-sport trends, PBs).
CREATE INDEX IF NOT EXISTS idx_workouts_user_sport ON workouts (user_id, sport, date DESC);

-- Tracks the high-water mark of each user's sync so we only fetch new sessions.
CREATE TABLE IF NOT EXISTS sync_state (
	user_id      INTEGER PRIMARY KEY,
	last_date    TEXT,                 -- most recent workout date synced
	last_sync_at INTEGER NOT NULL,     -- epoch ms of the sync run
	total        INTEGER NOT NULL DEFAULT 0
);
