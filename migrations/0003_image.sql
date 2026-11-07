-- Kansikuva. YouTube ja Spotify antavat sen oEmbedissä ilman avainta;
-- tavallisilta sivuilta se luetaan og:image-tagista.
ALTER TABLE bookmarks ADD COLUMN image_url TEXT;
