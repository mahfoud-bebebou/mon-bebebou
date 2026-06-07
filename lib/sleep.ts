import { getAgeInMonths, formatExactBabyAge } from "./demo";
import { isToday } from "./dashboard-messages";
import type { BebebouEvent } from "./supabase";

export type SiesteNoteData = {
  start: string;
  end: string;
  durationMin: number;
};

export type NuitReveilCause = "faim" | "couche" | "inconfort" | "inconnu";
export type NuitReveilDuree = "<10min" | "10-30min" | ">30min";

export type NuitReveil = {
  heure: string;
  cause: NuitReveilCause;
  duree: NuitReveilDuree;
};

export type NuitNoteData = {
  coucher: string;
  lever: string;
  reveils: NuitReveil[];
  totalReveils: number;
};

export type SommeilMeta = {
  heure_debut: string;
  heure_fin: string;
  nb_reveils?: number;
};

export type ActiveSieste = {
  scopeId: string;
  start: string;
  estimatedMinutes?: number;
};

export type ModeNuitState = {
  actif: boolean;
  heure_debut: string;
  coucher?: string;
  nb_reveils_prevus?: number;
};

export const ACTIVE_SIESTE_KEY = "bebebou-active-sieste";
export const NIGHT_DISMISS_PREFIX = "bebebou-night-dismiss-";
export const NIGHT_BEDTIME_PREFIX = "bebebou-night-bedtime-";

export function toTimeInputValue(date: Date = new Date()): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function combineDateAndTime(reference: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(reference);
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}

export function parseJsonNote<T>(note: string | null): T | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as T;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeNote(data: object): string {
  return JSON.stringify(data);
}

export function formatDurationHM(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function formatDurationCompact(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, "0")}`;
}

export function calcDurationBetweenTimes(debut: string, fin: string): number {
  const ref = new Date();
  const start = combineDateAndTime(ref, debut);
  let end = combineDateAndTime(ref, fin);
  let diff = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diff < 0) diff += 24 * 60;
  return Math.max(1, diff);
}

export function formatElapsedSince(startIso: string): string {
  const diffMs = Date.now() - new Date(startIso).getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export function formatChronometer(startIso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(startIso).getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function getMinNapMinutes(dateNaissance: string): number {
  const months = getAgeInMonths(dateNaissance);
  if (months < 3) return 20;
  if (months < 6) return 30;
  if (months < 12) return 40;
  return 45;
}

export function isSiesteNormal(
  durationMin: number,
  dateNaissance?: string | null
): boolean {
  if (!dateNaissance) return durationMin >= 30;
  return durationMin >= getMinNapMinutes(dateNaissance);
}

export function getSiesteEndToast(
  prenom: string,
  durationMin: number,
  dateNaissance?: string | null
): string {
  const duration = formatDurationHM(durationMin);
  if (isSiesteNormal(durationMin, dateNaissance)) {
    return `🌙 Sieste de ${duration} — parfait pour l'âge de ${prenom} ✅`;
  }
  return `⚠️ Sieste courte — surveiller l'humeur de ${prenom}`;
}

export function calcSleepMinutes(coucher: string, lever: string): number {
  const ref = new Date();
  const bed = combineDateAndTime(ref, coucher);
  let wake = combineDateAndTime(ref, lever);
  if (wake <= bed) {
    wake = new Date(wake.getTime() + 24 * 60 * 60 * 1000);
  }
  return Math.round((wake.getTime() - bed.getTime()) / 60000);
}

export function getNightAnalysis(
  prenom: string,
  dateNaissance: string | null | undefined,
  data: NuitNoteData
): string {
  const totalReveils = data.totalReveils;
  const sleepMin = calcSleepMinutes(data.coucher, data.lever);
  const sleepLabel = formatDurationHM(sleepMin);
  const age = dateNaissance ? formatExactBabyAge(dateNaissance) : "son âge";

  if (totalReveils === 0) {
    return `🌟 Excellente nuit ! ${prenom} a dormi ${sleepLabel} sans interruption`;
  }
  if (totalReveils <= 2) {
    return `✅ Nuit normale pour ${age} — ${prenom} se réveille encore la nuit, c'est tout à fait normal`;
  }
  return `💛 Nuit difficile — si ça continue, consultez votre pédiatre`;
}

export function countTodayReveils(events: BebebouEvent[]): number {
  return events
    .filter((e) => e.type === "nuit" && isToday(e.created_at))
    .reduce((sum, e) => {
      const meta = parseJsonNote<SommeilMeta | NuitNoteData>(e.note);
      if (!meta) return sum;
      if ("nb_reveils" in meta && meta.nb_reveils != null) {
        return sum + meta.nb_reveils;
      }
      return sum + ((meta as NuitNoteData).totalReveils ?? 0);
    }, 0);
}

export function hasNightRecordedToday(events: BebebouEvent[]): boolean {
  return events.some((e) => e.type === "nuit" && isToday(e.created_at));
}

export function isNightModeHour(): boolean {
  const h = new Date().getHours();
  return h >= 21 || h < 7;
}

export function isMorningPromptHour(): boolean {
  const h = new Date().getHours();
  return h >= 6 && h < 9;
}

export function getNightSessionDate(): string {
  const now = new Date();
  if (now.getHours() < 7) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

export function isNightBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(NIGHT_DISMISS_PREFIX + getNightSessionDate()) === "1"
  );
}

export function dismissNightBanner(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NIGHT_DISMISS_PREFIX + getNightSessionDate(), "1");
}

export function saveNightBedtime(coucher: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    NIGHT_BEDTIME_PREFIX + getNightSessionDate(),
    coucher
  );
}

export function loadNightBedtime(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NIGHT_BEDTIME_PREFIX + getNightSessionDate());
}

export function loadActiveSieste(scopeId: string): ActiveSieste | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SIESTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSieste;
    if (parsed.scopeId !== scopeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveSieste(sieste: ActiveSieste): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SIESTE_KEY, JSON.stringify(sieste));
}

export function clearActiveSieste(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_SIESTE_KEY);
}

export const MODE_NUIT_KEY = "mode_nuit";

function modeNuitStorageKey(scopeId: string): string {
  return `${MODE_NUIT_KEY}_${scopeId}`;
}

export function loadModeNuit(scopeId: string): ModeNuitState | null {
  if (typeof window === "undefined" || !scopeId) return null;
  try {
    const raw =
      localStorage.getItem(modeNuitStorageKey(scopeId)) ??
      localStorage.getItem(MODE_NUIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModeNuitState;
    return parsed.actif ? parsed : null;
  } catch {
    return null;
  }
}

export function saveModeNuit(scopeId: string, state: ModeNuitState): void {
  if (typeof window === "undefined" || !scopeId) return;
  localStorage.setItem(modeNuitStorageKey(scopeId), JSON.stringify(state));
}

export function clearModeNuit(scopeId: string): void {
  if (typeof window === "undefined" || !scopeId) return;
  localStorage.removeItem(modeNuitStorageKey(scopeId));
  localStorage.removeItem(MODE_NUIT_KEY);
}

export function getNightModeBiberonMessage(
  prenom: string,
  sexe?: "fille" | "garcon" | null
): string {
  const verb = sexe === "fille" ? "elle mangera" : "il mangera";
  return `🌙 Pas de panique — ${prenom} dort, ${verb} à son réveil 😴`;
}

export function genderIlElle(sexe?: "fille" | "garcon" | null): string {
  return sexe === "fille" ? "elle" : "il";
}

export function genderEveille(sexe?: "fille" | "garcon" | null): string {
  return sexe === "fille" ? "éveillée" : "éveillé";
}

export function genderReveille(sexe?: "fille" | "garcon" | null): string {
  return sexe === "fille" ? "Réveillée !" : "Réveillé !";
}

export function getSiesteDurationMinutes(
  startIso: string,
  endTime: string,
  endReference: Date = new Date()
): number {
  const start = new Date(startIso);
  const end = combineDateAndTime(endReference, endTime);
  let diff = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diff < 0) diff += 24 * 60;
  return Math.max(1, diff);
}

export function getTimelineEventLabel(event: BebebouEvent): string {
  if (event.type === "sieste") {
    const durationMin =
      event.quantity ??
      parseJsonNote<SiesteNoteData>(event.note)?.durationMin ??
      (() => {
        const meta = parseJsonNote<SommeilMeta>(event.note);
        return meta
          ? calcDurationBetweenTimes(meta.heure_debut, meta.heure_fin)
          : null;
      })();
    if (durationMin) {
      return `Sieste · ${formatDurationHM(durationMin)}`;
    }
    return "Sieste";
  }
  if (event.type === "nuit") {
    const meta = parseJsonNote<SommeilMeta>(event.note);
    if (meta?.heure_debut && meta.heure_fin) {
      const sleep = formatDurationHM(
        event.quantity ?? calcSleepMinutes(meta.heure_debut, meta.heure_fin)
      );
      const revCount = meta.nb_reveils ?? 0;
      const rev =
        revCount === 0
          ? "sans réveil"
          : `${revCount}${revCount >= 5 ? "+" : ""} réveil${revCount > 1 ? "s" : ""}`;
      return `Nuit · ${sleep} · ${rev}`;
    }
    const data = parseJsonNote<NuitNoteData>(event.note);
    if (data) {
      const sleep = formatDurationHM(calcSleepMinutes(data.coucher, data.lever));
      const rev =
        data.totalReveils === 0
          ? "sans réveil"
          : `${data.totalReveils} réveil${data.totalReveils > 1 ? "s" : ""}`;
      return `Nuit · ${sleep} · ${rev}`;
    }
    return "Nuit";
  }
  return "";
}

export const SIESTE_DURATION_OPTIONS = [30, 60, 90, 120] as const;
export const NUIT_REVEIL_COUNTS = [0, 1, 2, 3, 4] as const;
export const SOMMEIL_REVEIL_COUNTS = [0, 1, 2, 3, 4, 5] as const;

export const REVEIL_CAUSES: { id: NuitReveilCause; label: string }[] = [
  { id: "faim", label: "🍼 Faim" },
  { id: "couche", label: "🌿 Couche" },
  { id: "inconfort", label: "😣 Inconfort" },
  { id: "inconnu", label: "❓ Inconnu" },
];

export const REVEIL_DUREES: { id: NuitReveilDuree; label: string }[] = [
  { id: "<10min", label: "<10min" },
  { id: "10-30min", label: "10-30min" },
  { id: ">30min", label: ">30min" },
];
