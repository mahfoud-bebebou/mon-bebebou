-- Ajoute la colonne poids_actuel à la table babies
ALTER TABLE babies ADD COLUMN IF NOT EXISTS poids_actuel numeric;
