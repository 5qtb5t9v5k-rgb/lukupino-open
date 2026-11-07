-- Mediatyyppi ja lukutila (17.10.2026). Omistaja halusi suodattaa
-- tallennukset median mukaan ja pitää kesken olevat kirjat näkyvissä.
-- media: artikkeli | video | podcast | kirja | some | dokumentti | kuva
--   päätellään osoitteesta ja tiedostotyypistä (db.ts mediaFor), omistaja
--   voi vaihtaa. progress: NULL (ei seurata) | lukematta | kesken | luettu.
ALTER TABLE bookmarks ADD COLUMN media TEXT;
ALTER TABLE bookmarks ADD COLUMN progress TEXT;
UPDATE bookmarks SET media = CASE
  WHEN file_type LIKE 'image/%' THEN 'kuva'
  WHEN file_key IS NOT NULL THEN 'dokumentti'
  WHEN url LIKE '%youtube.com/%' OR url LIKE '%youtu.be/%' OR url LIKE '%vimeo.com/%' OR url LIKE '%tiktok.com/%' THEN 'video'
  WHEN url LIKE '%open.spotify.com/episode/%' OR url LIKE '%open.spotify.com/show/%' OR url LIKE '%podcasts.apple.com/%' OR url LIKE '%overcast.fm/%' OR url LIKE '%pca.st/%' THEN 'podcast'
  WHEN url LIKE '%://x.com/%' OR url LIKE '%://twitter.com/%' OR url LIKE '%reddit.com/%' OR url LIKE '%substack.com/note%' OR url LIKE '%linkedin.com/posts/%' OR url LIKE '%threads.net/%' OR url LIKE '%instagram.com/%' THEN 'some'
  WHEN url LIKE '%goodreads.com/%' OR url LIKE '%books.google.%' OR url LIKE '%kirjasampo.fi/%' THEN 'kirja'
  ELSE 'artikkeli' END;
CREATE INDEX IF NOT EXISTS bookmarks_media ON bookmarks(media);
CREATE INDEX IF NOT EXISTS bookmarks_progress ON bookmarks(progress);
