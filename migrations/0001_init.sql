-- Lukupino — D1-skeema. Ajetaan: npx wrangler d1 execute lukupino --file=schema.sql [--local]
-- Ei tageja tarkoituksella: Karakeepissa 300 tagia, joista 241 kertakäyttöisiä — mitattu turhiksi.

CREATE TABLE IF NOT EXISTS bookmarks (
  id            TEXT PRIMARY KEY,                 -- 12 merkin satunnainen
  url           TEXT NOT NULL,
  title         TEXT,
  description   TEXT,                             -- meta description / og:description
  excerpt       TEXT,                             -- sivun teksti (≤ 3000 merkkiä) tai Safarin Page Contents
  summary       TEXT,                             -- /kortti kirjoittaa
  note          TEXT,                             -- /kortti kirjoittaa (kortti + litteraatti)
  saved_at      TEXT NOT NULL,                    -- ISO 8601 UTC
  updated_at    TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'api',      -- safari | app | api | import
  status        TEXT NOT NULL DEFAULT 'inbox',    -- inbox | noudettu | ei-noudettavissa | kortitettu
  fetch_note    TEXT,                             -- miksi ei noudettu (esim. "x.com vaatii kirjautumisen")
  lists_json    TEXT NOT NULL DEFAULT '[]'        -- ["AI & agentit", ...]
);
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_url ON bookmarks(url);
CREATE INDEX IF NOT EXISTS bookmarks_saved ON bookmarks(saved_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_status ON bookmarks(status);

CREATE TABLE IF NOT EXISTS lists (
  name  TEXT PRIMARY KEY,
  icon  TEXT,
  sort  INTEGER NOT NULL DEFAULT 0
);

-- Täystekstihaku. Ulkoinen sisältö bookmarks-taulusta, triggerit pitävät synkassa.
CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
  title, description, excerpt, summary, note,
  content='bookmarks', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, title, description, excerpt, summary, note)
  VALUES (new.rowid, new.title, new.description, new.excerpt, new.summary, new.note);
END;
CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, excerpt, summary, note)
  VALUES ('delete', old.rowid, old.title, old.description, old.excerpt, old.summary, old.note);
END;
CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, excerpt, summary, note)
  VALUES ('delete', old.rowid, old.title, old.description, old.excerpt, old.summary, old.note);
  INSERT INTO bookmarks_fts(rowid, title, description, excerpt, summary, note)
  VALUES (new.rowid, new.title, new.description, new.excerpt, new.summary, new.note);
END;

-- Oletuslistat (samat kuin Karakeepissa 16.8.2026)
INSERT OR IGNORE INTO lists(name, icon, sort) VALUES
  ('AI & agentit', '🤖', 1),
  ('Tuotejohtaminen', '🧭', 2),
  ('Yrittäjyys & GTM', '🚀', 3),
  ('Talous', '💶', 4),
  ('Ajattelu & tuottavuus', '🧠', 5),
  ('Luettavaa', '📚', 6),
  ('Sisältö puuttuu', '⚠️', 7);
