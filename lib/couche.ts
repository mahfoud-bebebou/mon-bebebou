import { parseJsonNote } from "./sleep";
import type { BebebouEvent } from "./supabase";

export type TypeCouche = "pipi" | "selle" | "les_deux";

export type TypeLait =
  | "allaitement"
  | "lait_classique"
  | "lait_riz"
  | "hydrolysat"
  | "sans_lactose"
  | "mixte";

export type Intolerance = "APLV" | "lactose" | "reflux" | "coliques" | "autre";

export type CoucheMeta = {
  type_couche: TypeCouche;
  urine_couleur?: string;
  urine_quantite?: string;
  selle_couleur?: string;
  selle_consistance?: string;
  selle_quantite?: string;
  selle_odeur?: string;
  signes_associes?: string[];
};

export type CoucheAlert = {
  message: string;
  severity: "red" | "orange";
};

export const TYPE_LAIT_OPTIONS: { id: TypeLait; label: string }[] = [
  { id: "allaitement", label: "🤱 Allaitement" },
  { id: "lait_classique", label: "🍼 Lait classique" },
  { id: "lait_riz", label: "🍚 Lait de riz" },
  { id: "hydrolysat", label: "🌱 Hydrolysat" },
  { id: "sans_lactose", label: "🌾 Sans lactose" },
  { id: "mixte", label: "🤱🍼 Mixte" },
];

export const INTOLERANCE_OPTIONS: { id: Intolerance; label: string }[] = [
  { id: "APLV", label: "🥛 APLV" },
  { id: "lactose", label: "🧬 Intolérance lactose" },
  { id: "reflux", label: "🔄 Reflux" },
  { id: "coliques", label: "😣 Coliques" },
  { id: "autre", label: "➕ Autre" },
];

export const COUCHE_TYPE_OPTIONS: { id: TypeCouche; label: string }[] = [
  { id: "pipi", label: "💧 Pipi" },
  { id: "selle", label: "💩 Selle" },
  { id: "les_deux", label: "💧💩 Les deux" },
];

export const URINE_COULEUR_OPTIONS = [
  { id: "incolore", emoji: "🔵", label: "Incolore" },
  { id: "jaune_pale", emoji: "💛", label: "Jaune pâle ✅" },
  { id: "jaune_fonce", emoji: "🟡", label: "Jaune foncé" },
  { id: "orange_ambre", emoji: "🟠", label: "Orange/Ambre" },
  { id: "rose_rouge", emoji: "🔴", label: "Rose/Rouge" },
] as const;

export const URINE_QUANTITE_OPTIONS = [
  { id: "faible", label: "Faible" },
  { id: "normale", label: "Normale" },
  { id: "abondante", label: "Abondante" },
] as const;

export const SELLE_COULEUR_OPTIONS = [
  { id: "noir_meconium", emoji: "⚫", label: "Noir/Méconium" },
  { id: "vert_fonce", emoji: "🟢", label: "Vert foncé" },
  { id: "vert_clair", emoji: "💚", label: "Vert clair" },
  { id: "jaune_moutarde", emoji: "🟡", label: "Jaune moutarde" },
  { id: "jaune_brun", emoji: "🟤", label: "Jaune/Brun" },
  { id: "blanc_gris", emoji: "⬜", label: "Blanc/Gris 🚨" },
  { id: "rouge", emoji: "🔴", label: "Rouge 🚨" },
] as const;

export const SELLE_CONSISTANCE_OPTIONS = [
  { id: "liquide", emoji: "💦", label: "Liquide" },
  { id: "molle_mousseuse", emoji: "🫧", label: "Molle/Mousseuse" },
  { id: "granuleuse", emoji: "🟡", label: "Granuleuse" },
  { id: "dure_billes", emoji: "⚪", label: "Dure/Billes" },
] as const;

export const SELLE_QUANTITE_OPTIONS = [
  { id: "traces", label: "Traces" },
  { id: "normale", label: "Normale" },
  { id: "abondante", label: "Abondante" },
] as const;

export const SELLE_ODEUR_OPTIONS = [
  { id: "normale", emoji: "😊", label: "Normale" },
  { id: "forte_acide", emoji: "😣", label: "Forte/Acide" },
  { id: "sans_odeur", emoji: "😐", label: "Sans odeur" },
] as const;

export const SIGNES_ASSOCIES_OPTIONS = [
  { id: "rougeurs_fesses", label: "🔴 Rougeurs fesses" },
  { id: "ventre_gonfle", label: "🤰 Ventre gonflé" },
  { id: "gaz_excessifs", label: "💨 Gaz excessifs" },
  { id: "regurgitations", label: "🤮 Régurgitations" },
  { id: "pleurs_apres_biberon", label: "😢 Pleurs après biberon" },
] as const;

const MS_72H = 72 * 60 * 60 * 1000;

function getTodayStart(): Date {
  const aujourdhuiDebut = new Date();
  aujourdhuiDebut.setHours(0, 0, 0, 0);
  return aujourdhuiDebut;
}

function eventsToday(events: BebebouEvent[]): BebebouEvent[] {
  const aujourdhuiDebut = getTodayStart();
  return events.filter((e) => new Date(e.created_at) >= aujourdhuiDebut);
}

function isPipiCouche(event: BebebouEvent): boolean {
  if (event.type !== "couche") return false;
  const meta = parseCoucheMeta(event.note);
  if (meta) return includesPipi(meta.type_couche);
  return event.note === "pipi" || event.note === "les_deux";
}

function countPipiToday(events: BebebouEvent[]): number {
  return eventsToday(events).filter(isPipiCouche).length;
}

export function parseCoucheMeta(note: string | null): CoucheMeta | null {
  if (!note) return null;
  const json = parseJsonNote<CoucheMeta>(note);
  if (json?.type_couche) return json;
  if (note === "pipi") return { type_couche: "pipi" };
  if (note === "caca" || note === "selle") return { type_couche: "selle" };
  if (note === "les_deux") return { type_couche: "les_deux" };
  return null;
}

export function includesPipi(type: TypeCouche): boolean {
  return type === "pipi" || type === "les_deux";
}

export function includesSelle(type: TypeCouche): boolean {
  return type === "selle" || type === "les_deux";
}

export function getCoucheModalAlerts(
  type: TypeCouche | null,
  meta: Partial<CoucheMeta>,
  prenom: string
): CoucheAlert[] {
  if (!type) return [];
  const alerts: CoucheAlert[] = [];

  if (includesSelle(type)) {
    if (meta.selle_couleur === "blanc_gris") {
      alerts.push({
        severity: "red",
        message: "🚨 Selles blanches — consulte un médecin rapidement",
      });
    }
    if (meta.selle_couleur === "rouge") {
      alerts.push({
        severity: "red",
        message: "🚨 Selles rouges — consulte un médecin",
      });
    }
  }

  if (includesPipi(type) && meta.urine_couleur === "orange_ambre") {
    alerts.push({
      severity: "orange",
      message: `⚠️ Urine foncée — vérifie l'hydratation de ${prenom}`,
    });
  }

  return alerts;
}

function hasWhiteGreyStoolsToday(events: BebebouEvent[]): boolean {
  return eventsToday(events).some((e) => {
    if (e.type !== "couche") return false;
    const meta = parseCoucheMeta(e.note);
    return meta?.selle_couleur === "blanc_gris";
  });
}

function countLiquidStoolsToday(events: BebebouEvent[]): number {
  return eventsToday(events).filter((e) => {
    if (e.type !== "couche") return false;
    const meta = parseCoucheMeta(e.note);
    if (!meta || !includesSelle(meta.type_couche)) return false;
    return meta.selle_consistance === "liquide";
  }).length;
}

function countGreenFoamyStoolsToday(events: BebebouEvent[]): number {
  return eventsToday(events).filter((e) => {
    if (e.type !== "couche") return false;
    const meta = parseCoucheMeta(e.note);
    if (!meta || !includesSelle(meta.type_couche)) return false;
    return meta.selle_consistance === "molle_mousseuse";
  }).length;
}

function lastSelleTimestamp(events: BebebouEvent[]): number | null {
  const selles = events.filter((e) => {
    if (e.type !== "couche") return false;
    const meta = parseCoucheMeta(e.note);
    return meta ? includesSelle(meta.type_couche) : e.note === "caca";
  });
  if (selles.length === 0) return null;
  return Math.max(...selles.map((e) => new Date(e.created_at).getTime()));
}

function needsStoolMonitoring(typeLait?: TypeLait | null): boolean {
  return (
    typeLait === "lait_classique" ||
    typeLait === "lait_riz" ||
    typeLait === "mixte"
  );
}

function hasApLvWatch(intolerances?: Intolerance[] | null): boolean {
  return (
    intolerances?.includes("APLV") === true ||
    intolerances?.includes("lactose") === true
  );
}

export function getCoucheDashboardAlerts(
  events: BebebouEvent[],
  prenom: string,
  typeLait?: TypeLait | null,
  intolerances?: Intolerance[] | null
): CoucheAlert[] {
  const alerts: CoucheAlert[] = [];
  const pipiCount = countPipiToday(events);

  if (pipiCount < 6) {
    alerts.push({
      severity: "orange",
      message: `💧 Seulement ${pipiCount} couche${pipiCount > 1 ? "s" : ""} mouillée${pipiCount > 1 ? "s" : ""} aujourd'hui — vérifie l'hydratation de ${prenom}`,
    });
  }

  if (hasWhiteGreyStoolsToday(events)) {
    alerts.push({
      severity: "red",
      message: "🚨 Tu as noté des selles blanches — consulte un médecin",
    });
  }

  const lastSelle = lastSelleTimestamp(events);
  if (needsStoolMonitoring(typeLait) && lastSelle !== null) {
    if (Date.now() - lastSelle >= MS_72H) {
      alerts.push({
        severity: "orange",
        message: `⚠️ Aucune selle depuis 3 jours — surveille ${prenom}`,
      });
    }
  } else if (needsStoolMonitoring(typeLait) && lastSelle === null) {
    const oldestCouche = events.find((e) => e.type === "couche");
    if (!oldestCouche || Date.now() - new Date(oldestCouche.created_at).getTime() >= MS_72H) {
      alerts.push({
        severity: "orange",
        message: `⚠️ Aucune selle depuis 3 jours — surveille ${prenom}`,
      });
    }
  }

  const liquidCount = countLiquidStoolsToday(events);
  if (liquidCount >= 3) {
    alerts.push({
      severity: "orange",
      message: `⚠️ ${prenom} a eu des selles liquides ${liquidCount} fois aujourd'hui — surveille l'hydratation`,
    });
  }

  const watchSpecial =
    hasApLvWatch(intolerances) || typeLait === "lait_riz";
  const greenFoamy = countGreenFoamyStoolsToday(events);
  if (watchSpecial && greenFoamy >= 2) {
    alerts.push({
      severity: "orange",
      message:
        "⚠️ Selles vertes mousseuses fréquentes — à mentionner au pédiatre",
    });
  }

  return alerts;
}

export function formatCoucheLabel(meta: CoucheMeta | null): string {
  if (!meta) return "Changement de couche";
  const parts: string[] = [];
  if (includesPipi(meta.type_couche)) parts.push("Pipi");
  if (includesSelle(meta.type_couche)) parts.push("Selle");
  return parts.length ? `Couche · ${parts.join(" + ")}` : "Changement de couche";
}
