-- Koko litteraatti: sanatarkka teksti, aikaleimat ja puhujat. 2 h jakso on
-- 100–150 kt, joten se on omassa taulussaan eikä kulje viennissä, haussa
-- eikä listauksessa. Kirjanmerkillä on vain sanamäärä, josta selaus-UI
-- tietää näyttää linkin lukunäkymään. Lisätty 5.10.2026.
CREATE TABLE IF NOT EXISTS transcripts (
  bookmark_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  source TEXT,
  words INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
ALTER TABLE bookmarks ADD COLUMN transcript_words INTEGER;
