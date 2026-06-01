-- Public leaderboard standings: one published result per athlete per board,
-- where a board is a (sport, standard distance) pair. Extends the share infra —
-- `share_token` points at the athlete's public replay (`/r/<token>`) when set.
-- `user_id` is a key only and is never returned to the client; `display_name`
-- is the only identity exposed publicly.
CREATE TABLE IF NOT EXISTS leaderboard_entry (
	sport        TEXT    NOT NULL,            -- rower | skierg | bike
	distance     INTEGER NOT NULL,            -- standard board distance, metres
	user_id      INTEGER NOT NULL,
	workout_id   INTEGER NOT NULL,
	display_name TEXT    NOT NULL,
	time         REAL    NOT NULL,            -- elapsed seconds (rank key)
	pace         REAL    NOT NULL,            -- sec / 500m
	date         TEXT    NOT NULL,            -- "YYYY-MM-DD HH:MM:SS"
	share_token  TEXT,                        -- public replay token, when shared
	published_at INTEGER NOT NULL,            -- epoch ms
	-- One (best) entry per athlete per board; publish UPSERTs and keeps the faster time.
	PRIMARY KEY (sport, distance, user_id)
);

-- Board read: fastest-first within a (sport, distance).
CREATE INDEX IF NOT EXISTS idx_leaderboard_board
	ON leaderboard_entry (sport, distance, time ASC);
