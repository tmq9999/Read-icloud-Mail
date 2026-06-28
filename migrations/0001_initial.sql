-- Migration: initial schema for iCloud OTP mail reader
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  sender TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_received
  ON messages(recipient, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages(created_at);
