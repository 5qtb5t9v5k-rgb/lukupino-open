-- Tallennetut tiedostot: kuvat, PDF:t ja muut dokumentit.
-- Tavut ovat KV:ssä (binding FILES), tässä vain viite ja metatiedot.
ALTER TABLE bookmarks ADD COLUMN file_key TEXT;
ALTER TABLE bookmarks ADD COLUMN file_type TEXT;
ALTER TABLE bookmarks ADD COLUMN file_size INTEGER;
CREATE INDEX IF NOT EXISTS bookmarks_file ON bookmarks(file_key);
