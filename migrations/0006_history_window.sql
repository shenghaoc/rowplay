-- Backfill watermark for windowed first sync (history-windowing spec).
ALTER TABLE sync_state ADD COLUMN oldest_date TEXT;
ALTER TABLE sync_state ADD COLUMN backfill_done INTEGER NOT NULL DEFAULT 0;
