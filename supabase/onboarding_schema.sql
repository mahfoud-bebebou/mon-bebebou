-- Schéma mis à jour pour le nouvel onboarding Mon Bebebou

-- Colonne created_by sur families
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Nouvelles colonnes sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prenom_maman text,
  ADD COLUMN IF NOT EXISTS prenom_papa text,
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families(id);

-- Nouvelles colonnes sur babies (remplace name/birthdate si besoin)
ALTER TABLE babies
  ADD COLUMN IF NOT EXISTS prenom text,
  ADD COLUMN IF NOT EXISTS date_naissance date,
  ADD COLUMN IF NOT EXISTS sexe text,
  ADD COLUMN IF NOT EXISTS poids_naissance numeric,
  ADD COLUMN IF NOT EXISTS parcours text;

-- RLS
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their family" ON families;
DROP POLICY IF EXISTS "Users can read their family" ON families;
DROP POLICY IF EXISTS "Users can insert their profile" ON profiles;
DROP POLICY IF EXISTS "Users can read their profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert babies" ON babies;
DROP POLICY IF EXISTS "Users can read babies" ON babies;

CREATE POLICY "Users can insert their family" ON families
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can read their family" ON families
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read their profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert babies" ON babies
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read babies" ON babies
  FOR SELECT USING (true);
