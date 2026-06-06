import type { BebebouEvent, EventType } from "./supabase";
import { supabase } from "./supabase";

export const DEMO_SESSION_KEY = "bebebou-demo-session-id";
export const DEMO_BABY_KEY = "bebebou-demo-baby";

export type DemoBabySexe = "fille" | "garcon";
export type DemoParcours = "allaite" | "artificiel" | "mixte";

export type DemoBaby = {
  session_id: string;
  prenom: string;
  sexe: DemoBabySexe;
  date_naissance: string;
  poids_naissance: number;
  poids_actuel: number;
  parcours: DemoParcours;
};

export const POIDS_NAISSANCE_KEY = "poids_naissance";
export const POIDS_ACTUEL_KEY = "poids_actuel";

type LegacyDemoBaby = {
  sessionId?: string;
  session_id?: string;
  prenom?: string;
  sexe?: DemoBabySexe;
  dateNaissance?: string;
  date_naissance?: string;
  poidsNaissance?: number;
  poids_naissance?: number;
  poids_actuel?: number;
  poids?: number;
  parcours?: DemoParcours;
};

export function saveWeightLocalStorage(
  poidsNaissance: number,
  poidsActuel: number
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(POIDS_NAISSANCE_KEY, String(poidsNaissance));
  localStorage.setItem(POIDS_ACTUEL_KEY, String(poidsActuel));
}

export function loadPoidsNaissance(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(POIDS_NAISSANCE_KEY);
  if (!v) return null;
  const n = parseFloat(v);
  return n > 0 ? n : null;
}

export function loadPoidsActuel(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(POIDS_ACTUEL_KEY);
  if (!v) return null;
  const n = parseFloat(v);
  return n > 0 ? n : null;
}

const INVITE_24H_PREFIX = "bebebou-invite-24h-";
const INVITE_8_PREFIX = "bebebou-invite-8-";
const DEMO_EVENTS_FALLBACK_KEY = "bebebou-demo-events-fallback";

function isMissingSessionIdColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error ? String(error.message).toLowerCase() : "";
  const code = "code" in error ? String(error.code) : "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("session_id") &&
      (message.includes("does not exist") ||
        message.includes("could not find") ||
        message.includes("column")))
  );
}

function loadDemoEventsFallback(sessionId: string): BebebouEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_EVENTS_FALLBACK_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Record<string, BebebouEvent[]>;
    return stored[sessionId] ?? [];
  } catch {
    return [];
  }
}

function saveDemoEventsFallback(
  sessionId: string,
  events: BebebouEvent[]
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(DEMO_EVENTS_FALLBACK_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, BebebouEvent[]>) : {};
    stored[sessionId] = events;
    localStorage.setItem(DEMO_EVENTS_FALLBACK_KEY, JSON.stringify(stored));
  } catch {
    // ignore storage errors
  }
}

function normalizeDemoBaby(raw: LegacyDemoBaby): DemoBaby | null {
  const session_id = raw.session_id ?? raw.sessionId;
  const date_naissance = raw.date_naissance ?? raw.dateNaissance;
  const poids_naissance =
    raw.poids_naissance ?? raw.poidsNaissance ?? raw.poids;
  const poids_actuel = raw.poids_actuel ?? raw.poids ?? poids_naissance;

  if (
    !session_id ||
    !raw.prenom ||
    !raw.sexe ||
    !date_naissance ||
    !poids_naissance ||
    poids_naissance <= 0 ||
    !poids_actuel ||
    poids_actuel <= 0 ||
    !raw.parcours
  ) {
    return null;
  }

  return {
    session_id,
    prenom: raw.prenom,
    sexe: raw.sexe,
    date_naissance,
    poids_naissance,
    poids_actuel,
    parcours: raw.parcours,
  };
}

function loadAllDemoBabies(): Record<string, DemoBaby> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEMO_BABY_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, LegacyDemoBaby> | LegacyDemoBaby;
    const entries: Record<string, DemoBaby> = {};

    if (
      ("session_id" in parsed || "sessionId" in parsed) &&
      !Array.isArray(parsed)
    ) {
      const baby = normalizeDemoBaby(parsed as LegacyDemoBaby);
      if (baby) entries[baby.session_id] = baby;
      return entries;
    }

    for (const [key, value] of Object.entries(parsed as Record<string, LegacyDemoBaby>)) {
      const baby = normalizeDemoBaby(value);
      if (baby) entries[key] = baby;
    }

    return entries;
  } catch {
    return {};
  }
}

function isValidDemoBaby(baby: DemoBaby): boolean {
  return Boolean(
    baby.session_id &&
      baby.prenom &&
      baby.sexe &&
      baby.date_naissance &&
      baby.poids_naissance > 0 &&
      baby.poids_actuel > 0 &&
      baby.parcours
  );
}

export function getAgeInMonths(date_naissance: string): number {
  const birth = new Date(date_naissance);
  const days = (Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24);
  return days / 30.44;
}

export function getAgeInDays(date_naissance: string): number {
  const birth = new Date(date_naissance);
  return Math.max(0, Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24)));
}

export function formatExactBabyAge(date_naissance: string): string {
  const days = getAgeInDays(date_naissance);

  if (days < 14) {
    return `${days} jour${days > 1 ? "s" : ""}`;
  }
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return `${weeks} semaine${weeks > 1 ? "s" : ""}`;
  }

  const months = Math.floor(getAgeInMonths(date_naissance));
  if (months < 24) {
    return `${months} mois`;
  }

  const years = Math.floor(months / 12);
  return `${years} an${years > 1 ? "s" : ""}`;
}

export function formatDemoBabyInfo(baby: DemoBaby): string {
  return `${baby.prenom} · ${formatExactBabyAge(baby.date_naissance)}`;
}

export function getBottlesPerDay(date_naissance: string): number {
  const months = getAgeInMonths(date_naissance);
  if (months < 1) return 8;
  if (months < 2) return 7;
  if (months < 3) return 6;
  if (months < 6) return 5;
  return 4;
}

export function getRecommendedMl(baby: DemoBaby): number {
  const nbBiberons = getBottlesPerDay(baby.date_naissance);
  const raw = (baby.poids_actuel * 150) / nbBiberons;
  return Math.round(raw / 10) * 10;
}

export function getFeedingIntervalMinutes(date_naissance: string): number {
  const months = getAgeInMonths(date_naissance);
  if (months < 1) return 135;
  if (months < 2) return 165;
  if (months < 4) return 195;
  return 225;
}

export function formatFeedingInterval(date_naissance: string): string {
  const months = getAgeInMonths(date_naissance);
  if (months < 1) return "2h-2h30";
  if (months < 2) return "2h30-3h";
  if (months < 4) return "3h-3h30";
  return "3h30-4h";
}

export function computeDemoBabyMetrics(baby: DemoBaby) {
  return {
    ageLabel: formatExactBabyAge(baby.date_naissance),
    recommendedMl: getRecommendedMl(baby),
    intervalLabel: formatFeedingInterval(baby.date_naissance),
    intervalMinutes: getFeedingIntervalMinutes(baby.date_naissance),
  };
}

export type DemoFeedingBanner = {
  message: string;
  backgroundColor: string;
};

function getLastMealEvent(
  baby: DemoBaby,
  events: BebebouEvent[]
): BebebouEvent | null {
  const lastBiberon = events.find((e) => e.type === "biberon");
  if (lastBiberon) return lastBiberon;
  if (baby.parcours === "allaite" || baby.parcours === "mixte") {
    return events[0] ?? null;
  }
  return null;
}

function isTeteeLabel(
  baby: DemoBaby,
  lastRecordedType?: EventType | null
): boolean {
  if (baby.parcours === "allaite") return true;
  if (baby.parcours === "artificiel") return false;
  return lastRecordedType !== "biberon";
}

function getProchainLabel(
  baby: DemoBaby,
  lastRecordedType?: EventType | null
): string {
  return isTeteeLabel(baby, lastRecordedType)
    ? "Prochaine tétée"
    : "Prochain biberon";
}

function getHeureLabel(
  baby: DemoBaby,
  lastRecordedType?: EventType | null
): string {
  return isTeteeLabel(baby, lastRecordedType)
    ? "C'est l'heure de la tétée !"
    : "C'est l'heure du biberon !";
}

export function getDemoFeedingBanner(
  baby: DemoBaby,
  events: BebebouEvent[],
  lastRecordedType?: EventType | null
): DemoFeedingBanner {
  const recommendedMl = getRecommendedMl(baby);
  const lastMeal = getLastMealEvent(baby, events);

  if (!lastMeal) {
    const intervalLabel = formatFeedingInterval(baby.date_naissance);
    return {
      message: `💡 ${recommendedMl} ml par biberon · Toutes les ${intervalLabel}`,
      backgroundColor: "#D4EDE1",
    };
  }

  const intervalMs = getFeedingIntervalMinutes(baby.date_naissance) * 60000;
  const nextMealAt = new Date(lastMeal.created_at).getTime() + intervalMs;
  const remainingMs = nextMealAt - Date.now();
  const remainingMin = remainingMs / 60000;
  const totalMin = Math.ceil(remainingMs / 60000);

  if (remainingMin <= 0) {
    return {
      message: getHeureLabel(baby, lastRecordedType),
      backgroundColor: "#FFE4E4",
    };
  }

  if (remainingMin > 60) {
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return {
      message: `${getProchainLabel(baby, lastRecordedType)} dans ${hours}h ${minutes}min`,
      backgroundColor: "#D4EDE1",
    };
  }

  if (remainingMin > 30) {
    return {
      message: `${getProchainLabel(baby, lastRecordedType)} dans ${totalMin}min`,
      backgroundColor: "#FFF3CD",
    };
  }

  return {
    message: `Bébé va bientôt avoir faim — dans ${totalMin}min`,
    backgroundColor: "#FFE0CC",
  };
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(DEMO_SESSION_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  localStorage.setItem(DEMO_SESSION_KEY, sessionId);
  return sessionId;
}

export function getDemoBaby(sessionId: string): DemoBaby | null {
  if (!sessionId) return null;
  const baby = loadAllDemoBabies()[sessionId];
  if (!baby || !isValidDemoBaby(baby)) return null;
  return baby;
}

export function saveDemoBaby(baby: DemoBaby): void {
  if (typeof window === "undefined") return;
  const stored = loadAllDemoBabies();
  stored[baby.session_id] = baby;
  localStorage.setItem(DEMO_BABY_KEY, JSON.stringify(stored));
  saveWeightLocalStorage(baby.poids_naissance, baby.poids_actuel);
}

export function hasDemoBaby(sessionId: string): boolean {
  return getDemoBaby(sessionId) !== null;
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  const sessionId = localStorage.getItem(DEMO_SESSION_KEY);
  if (sessionId) {
    const stored = loadAllDemoBabies();
    delete stored[sessionId];
    localStorage.setItem(DEMO_BABY_KEY, JSON.stringify(stored));
  }
  localStorage.removeItem(DEMO_SESSION_KEY);
}

export async function fetchDemoEvents(
  sessionId: string
): Promise<BebebouEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, type, note, quantity, created_at, session_id, user_id")
    .eq("session_id", sessionId)
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingSessionIdColumn(error)) {
      console.warn(
        "session_id column missing on events — using localStorage fallback"
      );
      return loadDemoEventsFallback(sessionId);
    }
    throw error;
  }

  return data ?? [];
}

export async function insertDemoEvent(
  sessionId: string,
  type: EventType,
  note?: string,
  quantity?: number,
  createdAt?: string
): Promise<void> {
  const row: Record<string, unknown> = {
    type,
    note: note ?? null,
    quantity: quantity ?? null,
    session_id: sessionId,
    user_id: null,
  };
  if (createdAt) row.created_at = createdAt;

  const { error } = await supabase.from("events").insert(row);

  if (error) {
    if (isMissingSessionIdColumn(error)) {
      const existing = loadDemoEventsFallback(sessionId);
      const newEvent: BebebouEvent = {
        id: crypto.randomUUID(),
        type,
        note: note ?? null,
        quantity: quantity ?? null,
        created_at: createdAt ?? new Date().toISOString(),
        session_id: sessionId,
        user_id: null,
      };
      saveDemoEventsFallback(sessionId, [newEvent, ...existing]);
      return;
    }
    throw error;
  }
}

export async function migrateDemoEvents(
  sessionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ user_id: userId, session_id: null })
    .eq("session_id", sessionId)
    .is("user_id", null);

  if (error) throw error;
}

export function getOldestEvent(events: BebebouEvent[]): BebebouEvent | null {
  if (events.length === 0) return null;
  return events.reduce((oldest, event) =>
    new Date(event.created_at) < new Date(oldest.created_at) ? event : oldest
  );
}

export function isReturningAfter24h(events: BebebouEvent[]): boolean {
  const oldest = getOldestEvent(events);
  if (!oldest) return false;
  const hoursSinceFirst =
    (Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60);
  return hoursSinceFirst >= 24;
}

export function wasInvite24hShown(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${INVITE_24H_PREFIX}${sessionId}`) === "1";
}

export function markInvite24hShown(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${INVITE_24H_PREFIX}${sessionId}`, "1");
}

export function wasInvite8Shown(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${INVITE_8_PREFIX}${sessionId}`) === "1";
}

export function markInvite8Shown(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${INVITE_8_PREFIX}${sessionId}`, "1");
}
