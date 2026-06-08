import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntervalleMinutes } from "./biberon";
import type { BebebouEvent } from "./supabase";

export const USER_SETTINGS_STORAGE_KEY = "user_settings";

export type UserSettings = {
  user_id?: string;
  baby_id?: string | null;
  notif_enabled?: boolean;
  notif_delay_minutes?: number;
  couche_alert_enabled?: boolean;
  couche_alert_hours?: number;
  coparent_notif?: boolean;
  nuit_auto_enabled?: boolean;
  nuit_auto_debut?: string;
  nuit_auto_fin?: string;
  biberon_intervalle_auto?: boolean;
  biberon_intervalle_minutes?: number;
  biberon_quantite_defaut?: number;
  heure_coucher_defaut?: string;
  heure_reveil_defaut?: string;
  sieste_alerte_enabled?: boolean;
  sieste_alerte_minutes?: number;
  sieste_notif_enabled?: boolean;
  sieste_notif_interval_minutes?: number;
  nuit_notif_enabled?: boolean;
  nuit_notif_interval_minutes?: number;
  nuit_alerte_courte_enabled?: boolean;
  nuit_alerte_courte_minutes?: number;
  unite_poids?: "kg" | "g";
  updated_at?: string;
};

export function getDefaultUserSettings(): UserSettings {
  return {
    notif_enabled: false,
    notif_delay_minutes: 15,
    couche_alert_enabled: true,
    couche_alert_hours: 4,
    coparent_notif: true,
    nuit_auto_enabled: false,
    nuit_auto_debut: "21:00",
    nuit_auto_fin: "07:00",
    biberon_intervalle_auto: true,
    biberon_intervalle_minutes: 210,
    biberon_quantite_defaut: 150,
    heure_coucher_defaut: "21:00",
    heure_reveil_defaut: "07:00",
    sieste_alerte_enabled: false,
    sieste_alerte_minutes: 120,
    sieste_notif_enabled: false,
    sieste_notif_interval_minutes: 15,
    nuit_notif_enabled: false,
    nuit_notif_interval_minutes: 60,
    nuit_alerte_courte_enabled: false,
    nuit_alerte_courte_minutes: 360,
    unite_poids: "kg",
  };
}

export function loadSettingsFromLocalStorage(): UserSettings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSettings;
  } catch {
    return null;
  }
}

export function saveSettingsToLocalStorage(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function mergeUserSettings(
  ...sources: (UserSettings | null | undefined)[]
): UserSettings {
  const defaults = getDefaultUserSettings();
  return sources.reduce<UserSettings>(
    (acc, src) => ({ ...acc, ...(src ?? {}) }),
    { ...defaults }
  );
}

export async function loadUserSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSettings> {
  const defaults = getDefaultUserSettings();
  const local = loadSettingsFromLocalStorage();
  let settings = mergeUserSettings(defaults, local, { user_id: userId });

  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    settings = mergeUserSettings(defaults, data as UserSettings);
    saveSettingsToLocalStorage(settings);
  } else if (local) {
    saveSettingsToLocalStorage(settings);
  }

  return settings;
}

export async function saveUserSetting<K extends keyof UserSettings>(
  supabase: SupabaseClient,
  userId: string,
  babyId: string | null,
  key: K,
  value: UserSettings[K],
  current: UserSettings
): Promise<UserSettings> {
  const updated: UserSettings = {
    ...current,
    [key]: value,
    user_id: userId,
    baby_id: babyId,
    updated_at: new Date().toISOString(),
  };
  saveSettingsToLocalStorage(updated);

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      baby_id: babyId,
      ...updated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) console.error("user_settings upsert:", error);
  return updated;
}

export async function saveUserSettingsBatch(
  supabase: SupabaseClient,
  userId: string,
  babyId: string | null,
  patch: Partial<UserSettings>,
  current: UserSettings
): Promise<UserSettings> {
  const updated: UserSettings = {
    ...current,
    ...patch,
    user_id: userId,
    baby_id: babyId,
    updated_at: new Date().toISOString(),
  };
  saveSettingsToLocalStorage(updated);

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      baby_id: babyId,
      ...updated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) console.error("user_settings upsert:", error);
  return updated;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export function isInAutoNightWindow(
  settings: UserSettings,
  now: Date = new Date()
): boolean {
  if (!settings.nuit_auto_enabled) return false;
  const start = settings.nuit_auto_debut ?? "21:00";
  const end = settings.nuit_auto_fin ?? "07:00";
  const nowM = now.getHours() * 60 + now.getMinutes();
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);

  if (startM > endM) {
    return nowM >= startM || nowM < endM;
  }
  return nowM >= startM && nowM < endM;
}

export function getEffectiveBiberonIntervalMinutes(
  settings: UserSettings,
  ageEnJours: number,
  parcours: string
): number {
  if (settings.biberon_intervalle_auto !== false) {
    return getIntervalleMinutes(ageEnJours, parcours);
  }
  return settings.biberon_intervalle_minutes ?? 210;
}

export function getDefaultBiberonQuantity(settings: UserSettings): number {
  return settings.biberon_quantite_defaut ?? 150;
}

export function isCoparentNotifEnabled(settings: UserSettings): boolean {
  return settings.coparent_notif !== false;
}

export function getCoucheHoursAlert(
  events: BebebouEvent[],
  settings: UserSettings,
  prenom: string
): { message: string } | null {
  if (settings.couche_alert_enabled === false) return null;

  const derniereCouche = events
    .filter((e) => e.type === "couche")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

  if (!derniereCouche) return null;

  const heuresDepuis =
    (Date.now() - new Date(derniereCouche.created_at).getTime()) / 3_600_000;
  const threshold = settings.couche_alert_hours ?? 4;

  if (heuresDepuis >= threshold) {
    return {
      message: `🌿 Aucun change depuis ${Math.floor(heuresDepuis)}h — pense à changer ${prenom}`,
    };
  }

  return null;
}
