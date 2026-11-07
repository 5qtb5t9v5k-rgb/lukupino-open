-- Pistokoe: osa-alue, taso ja ulkoinen lähde väitteelle. Lähtötasotesti
-- (ensimmäinen: Claude Code, 21.10.2026) mittaa osaamista osa-alueittain, ja
-- sen väitteet tarkistetaan dokumentaatiosta eikä lukupinon tallennuksesta.
ALTER TABLE quiz_items ADD COLUMN area TEXT;
ALTER TABLE quiz_items ADD COLUMN level TEXT;
ALTER TABLE quiz_items ADD COLUMN src_url TEXT;
ALTER TABLE quiz_items ADD COLUMN src_title TEXT;
