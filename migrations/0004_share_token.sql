-- Unguessable capability token for public, read-only replay links.
-- Only rows with a non-null share_token are reachable via /r/<token>.
ALTER TABLE workout_detail ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_detail_share_token
	ON workout_detail (share_token)
	WHERE share_token IS NOT NULL;
