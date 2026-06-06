-- Policies RLS pour l'onboarding Mon Bebebou

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;

-- Supprime les anciennes policies si elles existent
DROP POLICY IF EXISTS "Users manage own families" ON families;
DROP POLICY IF EXISTS "Users can insert their family" ON families;
DROP POLICY IF EXISTS "Users can read their family" ON families;
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their profile" ON profiles;
DROP POLICY IF EXISTS "Users can read their profile" ON profiles;
DROP POLICY IF EXISTS "Users read family babies" ON babies;
DROP POLICY IF EXISTS "Users insert family babies" ON babies;
DROP POLICY IF EXISTS "Users can insert babies" ON babies;
DROP POLICY IF EXISTS "Users can read babies" ON babies;

-- Colonne created_by si manquante
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

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
