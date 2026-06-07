-- Autorise la modification et suppression des événements

DROP POLICY IF EXISTS "Users update own events" ON events;
DROP POLICY IF EXISTS "Users delete own events" ON events;
DROP POLICY IF EXISTS "Anon update demo events" ON events;
DROP POLICY IF EXISTS "Anon delete demo events" ON events;

CREATE POLICY "Users update own events" ON events
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own events" ON events
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anon update demo events" ON events
  FOR UPDATE TO anon
  USING (session_id IS NOT NULL AND user_id IS NULL)
  WITH CHECK (session_id IS NOT NULL AND user_id IS NULL);

CREATE POLICY "Anon delete demo events" ON events
  FOR DELETE TO anon
  USING (session_id IS NOT NULL AND user_id IS NULL);
