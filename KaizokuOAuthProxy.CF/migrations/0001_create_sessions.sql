-- Migration 0001: Create OAuth sessions table
-- Stores ephemeral OAuth state + tokens with 5-minute TTL
-- Cleaned up by hourly cron: DELETE WHERE created_at < datetime('now', '-5 minutes')

CREATE TABLE IF NOT EXISTS oauth_sessions (
  state         TEXT PRIMARY KEY NOT NULL,
  instance_key  TEXT NOT NULL,
  provider      TEXT NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TEXT,            -- ISO 8601 datetime
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON oauth_sessions(created_at);