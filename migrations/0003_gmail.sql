-- Migration 0003: Gmail tempmail support
-- Base Gmail accounts that forward into the worker (managed from admin).
CREATE TABLE IF NOT EXISTS gmail_accounts (
  email TEXT PRIMARY KEY,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Canonical recipient (gmail: lowercased, dots removed, +suffix stripped) so that
-- any dot/plus variant of a base gmail resolves to the same inbox on read.
-- NOTE: ALTER ADD COLUMN is not idempotent in SQLite; run this migration once.
ALTER TABLE messages ADD COLUMN recipient_canonical TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_canonical
  ON messages(recipient_canonical, received_at DESC);
