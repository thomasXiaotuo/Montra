-- Apply to AUTH_DB. Ledger passwords and ownership must be outside SQL workbench.
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, proof_hash TEXT NOT NULL, owner_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_books (
 book_id INTEGER PRIMARY KEY, owner_id TEXT NOT NULL,
 salt TEXT, password_hash TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK ((salt IS NULL) = (password_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS account_books_owner ON account_books(owner_id);
CREATE TABLE IF NOT EXISTS book_unlocks (
 session_hash TEXT NOT NULL, book_id INTEGER NOT NULL, version INTEGER NOT NULL,
 PRIMARY KEY(session_hash,book_id)
);
CREATE TABLE IF NOT EXISTS book_login_limits (
 owner_id TEXT NOT NULL, book_id INTEGER NOT NULL, attempts INTEGER NOT NULL,
 reset_at INTEGER NOT NULL, PRIMARY KEY(owner_id,book_id)
);
CREATE TABLE IF NOT EXISTS account_migrations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
