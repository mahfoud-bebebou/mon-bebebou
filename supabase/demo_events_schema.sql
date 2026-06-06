-- Mode démo : session_id anonyme + migration vers user_id à l'inscription

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon insert demo events" ON events;
DROP POLICY IF EXISTS "Anon read demo events" ON events;
DROP POLICY IF EXISTS "Users insert own events" ON events;
DROP POLICY IF EXISTS "Users read own events" ON events;
DROP POLICY IF EXISTS "Users migrate demo events" ON events;

CREATE POLICY "Anon insert demo events" ON events
  FOR INSERT TO anon
  WITH CHECK (session_id IS NOT NULL AND user_id IS NULL);

CREATE POLICY "Anon read demo events" ON events
  FOR SELECT TO anon
  USING (session_id IS NOT NULL AND user_id IS NULL);

CREATE POLICY "Users insert own events" ON events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own events" ON events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users migrate demo events" ON events
  FOR UPDATE TO authenticated
  USING (user_id IS NULL AND session_id IS NOT NULL)
  WITH CHECK (auth.uid() = user_id);
