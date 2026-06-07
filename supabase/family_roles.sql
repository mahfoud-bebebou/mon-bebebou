-- Rôles famille, invitation et présence

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS prenom text,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS families_invite_code_idx
  ON families (invite_code)
  WHERE invite_code IS NOT NULL;

DROP POLICY IF EXISTS "Users read family profiles" ON profiles;
DROP POLICY IF EXISTS "Family members read family" ON families;

CREATE POLICY "Users read family profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    family_id IS NOT NULL
    AND family_id IN (
      SELECT p.family_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Family members read family" ON families
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT p.family_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_family_id_by_invite(p_code text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM families WHERE invite_code = upper(trim(p_code)) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_id_by_invite(text) TO authenticated;
