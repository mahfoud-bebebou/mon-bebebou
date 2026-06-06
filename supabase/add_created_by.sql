-- Ajoute la colonne created_by à la table families
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Met à jour la policy RLS si nécessaire
DROP POLICY IF EXISTS "Users manage own families" ON families;

CREATE POLICY "Users manage own families" ON families
  FOR ALL USING (auth.uid() = created_by);
