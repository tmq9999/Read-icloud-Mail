-- Migration 0002: admin analytics + auth support
-- Tracks addresses created by users (with creator IP) for the admin dashboard,
-- plus login rate-limiting and admin key/value config (e.g. allowed IPs).

-- One row per created address (UPSERT on email). created_at = first time created.
CREATE TABLE IF NOT EXISTS addresses (
  email TEXT PRIMARY KEY,
  domain TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hits INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_addresses_created ON addresses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addresses_domain ON addresses(domain);

-- Login attempts, for brute-force rate limiting (by IP, sliding window).
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_at ON login_attempts(ip, at);

-- Admin key/value config (allowed_ips JSON array, etc.)
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT
);
