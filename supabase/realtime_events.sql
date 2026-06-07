-- Realtime + lecture co-parent sur les événements du bébé

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users read family baby events" ON events;

CREATE POLICY "Users read family baby events" ON events
  FOR SELECT TO authenticated
  USING (
    baby_id IN (
      SELECT b.id
      FROM babies b
      JOIN profiles p ON p.family_id = b.family_id
      WHERE p.id = auth.uid()
    )
  );
