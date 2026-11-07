-- Kirjapalvelujen sivut kirjoiksi (17.10.2026): 0010 luokitteli Nextoryn
-- kirjasivut artikkeleiksi. Sama sääntö kuin db.ts mediaFor.
UPDATE bookmarks SET media = 'kirja'
 WHERE file_key IS NULL AND (
   url LIKE '%nextory.com/%/book/%' OR url LIKE '%storytel.com/%/book%'
   OR url LIKE '%bookbeat.com/%' OR url LIKE '%bookbeat.fi/%' OR url LIKE '%audible.%');
