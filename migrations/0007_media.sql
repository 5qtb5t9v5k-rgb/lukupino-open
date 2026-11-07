-- Mediatiedoston osoite: podcast-jakson MP3 RSS-syötteestä, jotta
-- litteraattia ei tarvitse etsiä uudelleen. YouTubella tätä ei tarvita —
-- Gemini ottaa videon osoitteen sellaisenaan.
ALTER TABLE bookmarks ADD COLUMN media_url TEXT;
