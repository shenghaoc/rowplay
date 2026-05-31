-- Per-user annual training goals (meters or hours), keyed by logbook user id.
CREATE TABLE IF NOT EXISTS user_goals (
	user_id   INTEGER NOT NULL,
	year      INTEGER NOT NULL,
	kind      TEXT NOT NULL,   -- meters | hours
	target    REAL NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, year)
);
