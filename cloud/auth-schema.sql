CREATE TABLE IF NOT EXISTS access_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  proof_version INTEGER NOT NULL DEFAULT 2,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  proof_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_limits (
  id INTEGER PRIMARY KEY CHECK(id=1),
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
