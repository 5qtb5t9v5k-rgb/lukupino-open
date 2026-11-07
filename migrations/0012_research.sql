-- Tutkimus: omistaja painaa jakaessa 4 tai kortin Tutki-nappia, ja rutiini
-- kirjoittaa aiheesta tutkimuksen skills/lukupino-tutki-sapluunalla. Teksti
-- (markdown, 10–20 kt) on omassa taulussaan kuten litteraatti. Kirjanmerkillä
-- on vain tila: NULL, pyydetty, valmis tai ei-onnistu. Lisätty 20.10.2026.
CREATE TABLE IF NOT EXISTS research (
  bookmark_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE bookmarks ADD COLUMN research_status TEXT;
