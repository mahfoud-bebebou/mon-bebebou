-- Préférences utilisateur (sync avec localStorage côté client)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  baby_id uuid REFERENCES babies(id) ON DELETE SET NULL,
  notif_enabled boolean DEFAULT false,
  notif_delay_minutes integer DEFAULT 15,
  couche_alert_enabled boolean DEFAULT true,
  couche_alert_hours integer DEFAULT 4,
  coparent_notif boolean DEFAULT true,
  nuit_auto_enabled boolean DEFAULT false,
  nuit_auto_debut text DEFAULT '21:00',
  nuit_auto_fin text DEFAULT '07:00',
  biberon_intervalle_auto boolean DEFAULT true,
  biberon_intervalle_minutes integer DEFAULT 210,
  biberon_quantite_defaut integer DEFAULT 150,
  heure_coucher_defaut text DEFAULT '21:00',
  heure_reveil_defaut text DEFAULT '07:00',
  sieste_alerte_enabled boolean DEFAULT false,
  sieste_alerte_minutes integer DEFAULT 120,
  sieste_notif_enabled boolean DEFAULT false,
  nuit_notif_enabled boolean DEFAULT false,
  unite_poids text DEFAULT 'kg',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
