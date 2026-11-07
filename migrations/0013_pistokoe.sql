-- Pistokoe: rutiini koostaa kerran viikossa oikein/väärin-väitteitä viikon
-- tallennuksista, omistaja vastaa puhelimella ja seuraava aamurutiini
-- kirjoittaa palautteen. Väärin menneet kysytään uudelleen (repeat_of).
-- Lisätty 20.10.2026.
CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  feedback TEXT,
  feedback_at TEXT
);
CREATE TABLE IF NOT EXISTS quiz_items (
  quiz_id TEXT NOT NULL,
  pos INTEGER NOT NULL,
  statement TEXT NOT NULL,
  correct INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  bookmark_id TEXT,
  anchor TEXT,
  kind TEXT,
  view TEXT,
  repeat_of TEXT,
  answer INTEGER,
  confident INTEGER,
  answered_at TEXT,
  PRIMARY KEY (quiz_id, pos)
);
CREATE INDEX IF NOT EXISTS quiz_items_repeat ON quiz_items(repeat_of);
CREATE INDEX IF NOT EXISTS quizzes_created ON quizzes(created_at);
