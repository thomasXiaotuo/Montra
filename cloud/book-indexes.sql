CREATE INDEX IF NOT EXISTS jilu_book_date_id ON jilu(book_id,riqi DESC,id DESC);
CREATE INDEX IF NOT EXISTS jilu_book_category ON jilu(book_id,category);
