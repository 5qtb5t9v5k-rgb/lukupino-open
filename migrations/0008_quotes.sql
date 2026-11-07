-- Poiminnat: lainaukset ja omat muistiinpanot, jotka jäivät mieleen.
-- kind = 'lahde'  : poimittu automaattisesti litteraatin POIMINNAT-osiosta
--        'oma'    : omistajan itse kirjoittama ("mitä jäi mieleen")
-- Lähteen poiminnat kirjoitetaan uudelleen kun litteraatti päivittyy;
-- tähdellä merkityt ja omat säilyvät aina.
CREATE TABLE IF NOT EXISTS quotes (
  id          TEXT PRIMARY KEY,
  bookmark_id TEXT,
  text        TEXT NOT NULL,
  who         TEXT,
  at          TEXT,
  kind        TEXT NOT NULL DEFAULT 'lahde',
  starred     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_bookmark ON quotes(bookmark_id);
CREATE INDEX IF NOT EXISTS quotes_created ON quotes(created_at);
