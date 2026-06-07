-- Alimentation et intolérances bébé

ALTER TABLE babies
  ADD COLUMN IF NOT EXISTS type_lait TEXT;

ALTER TABLE babies
  ADD COLUMN IF NOT EXISTS intolerances JSONB DEFAULT '[]'::jsonb;
