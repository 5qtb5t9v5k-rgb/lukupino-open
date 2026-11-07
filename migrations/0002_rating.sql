-- Arvio: kuinka hyvä lähde oli. 1 talteen · 2 hyvä · 3 erinomainen · NULL ei arvioitu.
-- Tarkoitus ei ole tähdittäminen vaan priorisointi: mikä 200:sta kannattaa lukea
-- kunnolla ja mistä kannattaa kirjoittaa kortti.
ALTER TABLE bookmarks ADD COLUMN rating INTEGER;
CREATE INDEX IF NOT EXISTS bookmarks_rating ON bookmarks(rating);
