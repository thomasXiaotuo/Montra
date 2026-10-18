CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 2147483647),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40),
  request_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO books(id,name) VALUES(1,'默认账本');
CREATE TABLE IF NOT EXISTS jilu (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 2147483647),
  riqi TEXT NOT NULL CHECK(length(riqi)=10 AND riqi GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND riqi>='0001-01-01' AND date(riqi,'+0 days') IS NOT NULL AND date(riqi,'+0 days')=riqi),
  type TEXT NOT NULL CHECK(type IN ('i','e')),
  amount NUMERIC NOT NULL CHECK(typeof(amount) IN ('integer','real') AND amount>0 AND amount<=99999999.99 AND abs(amount*100-round(amount*100))<0.00001),
  category TEXT NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 50 AND length(category)<=50),
  note TEXT CHECK(note IS NULL OR length(note)<=200),
  book_id INTEGER NOT NULL DEFAULT 1 CHECK(book_id BETWEEN 1 AND 2147483647)
);
CREATE INDEX IF NOT EXISTS jilu_date_id ON jilu(riqi DESC,id DESC);
CREATE INDEX IF NOT EXISTS jilu_category ON jilu(category);
