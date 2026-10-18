-- Back up D1, then apply ONCE to LEDGER_DB before enabling the new Worker.
-- Removes the global name uniqueness: each account may use the same book name.
-- Keep IDs and rows unchanged. D1 executes a file atomically.
CREATE TABLE books_account_upgrade (
 id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 2147483647),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40),
 request_key TEXT UNIQUE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO books_account_upgrade(id,name,request_key,created_at) SELECT id,name,request_key,created_at FROM books;
DROP TABLE books;
ALTER TABLE books_account_upgrade RENAME TO books;
