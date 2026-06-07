-- Persiste le mode nuit actif sur le bébé (utilisateurs connectés)

ALTER TABLE babies
  ADD COLUMN IF NOT EXISTS mode_nuit jsonb;
