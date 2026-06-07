-- Lie les événements au bébé Supabase (UUID)

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS baby_id uuid REFERENCES babies(id);

CREATE INDEX IF NOT EXISTS events_baby_id_idx ON events (baby_id);
