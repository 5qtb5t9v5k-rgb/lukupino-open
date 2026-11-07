-- Monta tiedostoa yhteen tallennukseen: kuusi näyttökuvaa samasta asiasta
-- on yksi nosto, ei kuutta kirjanmerkkiä. Sama JSON-idiomi kuin lists_json.
-- file_key/file_type/file_size jäävät ensimmäisen tiedoston tiedoiksi,
-- jotta kansikuva ja vanhat kutsupaikat toimivat muuttumatta.
ALTER TABLE bookmarks ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]';
UPDATE bookmarks
   SET files_json = json_array(json_object(
         'key', file_key,
         'name', COALESCE(title, 'tiedosto'),
         'type', COALESCE(file_type, 'application/octet-stream'),
         'size', COALESCE(file_size, 0)))
 WHERE file_key IS NOT NULL AND files_json = '[]';
