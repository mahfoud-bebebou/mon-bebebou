import { formatExactBabyAge, type DemoParcours } from "./demo";
import type { BebebouEvent } from "./supabase";

export type BiberonFeedback = {
  message: string;
  backgroundColor: string;
};

export type BiberonMinuteurMode = "countdown" | "overtime";

export type BiberonAlertState = {
  message: string;
  bandeauCouleur: string | null;
  afficherMinuteurInverse: boolean;
  minuteurMode: BiberonMinuteurMode | null;
};

function ageEnJoursFromDate(dateNaissance: string): number {
  const birth = new Date(dateNaissance);
  const now = new Date();
  return Math.max(
    0,
    Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function nourriSuffix(sexe?: "fille" | "garcon" | null): string {
  return sexe === "fille" ? "e" : "";
}

function isAllaitement(parcours: string): boolean {
  return parcours === "allaitement" || parcours === "allaite";
}

export function getIntervalleMinutes(
  ageEnJours: number,
  parcours: string
): number {
  let base: number;
  if (ageEnJours <= 14) base = 150;
  else if (ageEnJours <= 30) base = 165;
  else if (ageEnJours <= 60) base = 180;
  else if (ageEnJours <= 90) base = 195;
  else if (ageEnJours <= 120) base = 210;
  else if (ageEnJours <= 180) base = 210;
  else if (ageEnJours <= 270) base = 240;
  else if (ageEnJours <= 365) base = 270;
  else base = 300;

  if (isAllaitement(parcours)) return base - 30;
  return base;
}

export function getBiberonAlertState(params: {
  dernierBiberon: BebebouEvent | null;
  prenom: string;
  sexe?: "fille" | "garcon" | null;
  ageEnJours: number;
  parcours: string;
}): BiberonAlertState {
  const { dernierBiberon, prenom, sexe, ageEnJours, parcours } = params;

  if (!dernierBiberon) {
    return {
      message: `🍼 Enregistre le premier biberon de ${prenom}`,
      bandeauCouleur: null,
      afficherMinuteurInverse: false,
      minuteurMode: null,
    };
  }

  const dernierBiberonDate = new Date(dernierBiberon.created_at);
  const aujourdhuiSixHeures = new Date();
  aujourdhuiSixHeures.setHours(6, 0, 0, 0);

  if (dernierBiberonDate < aujourdhuiSixHeures) {
    return {
      message: `🍼 Bonjour ! Enregistre le premier biberon de ${prenom}`,
      bandeauCouleur: null,
      afficherMinuteurInverse: false,
      minuteurMode: null,
    };
  }

  const maintenant = Date.now();
  const dernierBiberonTime = new Date(dernierBiberon.created_at).getTime();
  const minutesEcoulees = (maintenant - dernierBiberonTime) / 60000;
  const intervalle = getIntervalleMinutes(ageEnJours, parcours);
  const pourcentage = (minutesEcoulees / intervalle) * 100;
  const hour = new Date().getHours();
  const estNuit = hour >= 22 || hour < 7;
  const qty = dernierBiberon.quantity ?? "?";

  if (pourcentage <= 15) {
    return {
      message: `🌟 Bien joué ! ${qty}ml — ${prenom} est bien nourri${nourriSuffix(sexe)}`,
      bandeauCouleur: null,
      afficherMinuteurInverse: false,
      minuteurMode: null,
    };
  }

  if (pourcentage <= 70) {
    return {
      message: `😴 ${prenom} digère tranquillement`,
      bandeauCouleur: null,
      afficherMinuteurInverse: false,
      minuteurMode: null,
    };
  }

  if (pourcentage <= 85) {
    const restant = Math.floor(intervalle - minutesEcoulees);
    return {
      message: `🍼 Pense à préparer le prochain biberon — dans ${restant} min`,
      bandeauCouleur: null,
      afficherMinuteurInverse: false,
      minuteurMode: null,
    };
  }

  if (pourcentage <= 100) {
    const restant = Math.floor(intervalle - minutesEcoulees);
    return {
      message: `⏰ Biberon bientôt pour ${prenom} — dans ${restant} min`,
      bandeauCouleur: "#FF9500",
      afficherMinuteurInverse: true,
      minuteurMode: "countdown",
    };
  }

  if (pourcentage <= 115) {
    const depasse = Math.floor(minutesEcoulees - intervalle);
    if (!estNuit) {
      return {
        message: `🔔 ${prenom} a faim ! — dépassé depuis ${depasse} min`,
        bandeauCouleur: "#E8406A",
        afficherMinuteurInverse: true,
        minuteurMode: "overtime",
      };
    }
    return {
      message: `🌙 Biberon de nuit — ${prenom} pourrait avoir faim`,
      bandeauCouleur: "#FF9500",
      afficherMinuteurInverse: true,
      minuteurMode: "overtime",
    };
  }

  const depasseMin = Math.floor(minutesEcoulees - intervalle);
  const depasseH = Math.floor(depasseMin / 60);
  const depasseM = depasseMin % 60;
  const tempsDepasse =
    depasseH > 0
      ? `${depasseH}h${String(depasseM).padStart(2, "0")}`
      : `${depasseMin} min`;

  if (!estNuit) {
    return {
      message: `⚠️ ${prenom} attend depuis ${tempsDepasse} !`,
      bandeauCouleur: "#C0392B",
      afficherMinuteurInverse: true,
      minuteurMode: "overtime",
    };
  }

  return {
    message: `🌙 Nuit calme — biberon si ${prenom} se réveille`,
    bandeauCouleur: "#FF9500",
    afficherMinuteurInverse: false,
    minuteurMode: null,
  };
}

export function formatBiberonInverseTimer(
  lastBiberonAt: string,
  ageEnJours: number,
  parcours: string,
  mode: BiberonMinuteurMode
): string {
  const intervalle = getIntervalleMinutes(ageEnJours, parcours);
  const target = new Date(lastBiberonAt).getTime() + intervalle * 60 * 1000;
  const now = Date.now();

  if (mode === "countdown") {
    const remainingMs = Math.max(0, target - now);
    const totalSec = Math.ceil(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `dans ${min} min ${sec}s`;
  }

  const overtimeMs = Math.max(0, now - target);
  const totalSec = Math.floor(overtimeMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `dépassé de ${h}h ${m}min ${s}s`;
  if (m > 0) return `dépassé de ${m}min ${s}s`;
  return `dépassé de ${s}s`;
}

export type BiberonRecommandation = {
  ml: number;
  intervalleMin: number;
};

export function getBiberonRecommandation(
  ageEnJours: number
): BiberonRecommandation {
  if (ageEnJours <= 14) return { ml: 75, intervalleMin: 150 };
  if (ageEnJours <= 30) return { ml: 105, intervalleMin: 180 };
  if (ageEnJours <= 60) return { ml: 135, intervalleMin: 180 };
  if (ageEnJours <= 90) return { ml: 165, intervalleMin: 210 };
  if (ageEnJours <= 180) return { ml: 180, intervalleMin: 210 };
  if (ageEnJours <= 270) return { ml: 225, intervalleMin: 240 };
  return { ml: 195, intervalleMin: 240 };
}

export function getRecommendedMlForBirthdate(dateNaissance: string): number {
  return getBiberonRecommandation(ageEnJoursFromDate(dateNaissance)).ml;
}

export function getFeedingIntervalMinutes(
  dateNaissance: string,
  parcours = "artificiel"
): number {
  return getIntervalleMinutes(ageEnJoursFromDate(dateNaissance), parcours);
}

export function formatFeedingInterval(
  dateNaissance: string,
  parcours = "artificiel"
): string {
  const intervalleMin = getIntervalleMinutes(
    ageEnJoursFromDate(dateNaissance),
    parcours
  );
  if (intervalleMin <= 150) return "2h-2h30";
  if (intervalleMin <= 180) return "2h30-3h";
  if (intervalleMin <= 210) return "3h-3h30";
  if (intervalleMin <= 240) return "3h30-4h";
  return "4h-4h30";
}

export function getRecommendedMlFromProfile(
  _poids: number,
  dateNaissance: string
): number {
  return getRecommendedMlForBirthdate(dateNaissance);
}

export function getBiberonQuantityFeedback(
  quantity: number,
  recommended: number,
  prenom: string
): BiberonFeedback | null {
  if (!quantity || quantity <= 0 || !recommended) return null;

  const low = recommended * 0.8;
  const high = recommended * 1.2;

  if (quantity >= low && quantity <= high) {
    return {
      message: `✅ Parfait pour ${prenom} !`,
      backgroundColor: "#D4EDE1",
    };
  }
  if (quantity < low) {
    return {
      message: "Un peu moins que d'habitude 💛",
      backgroundColor: "#FFF3E0",
    };
  }
  return {
    message: "Bon appétit ! 📈",
    backgroundColor: "#E3F2FD",
  };
}

export function getBiberonToast(
  quantityMl: number,
  dateNaissance: string | null | undefined
): string {
  const interval =
    dateNaissance != null ? formatFeedingInterval(dateNaissance) : "2h-3h";
  return `🍼 ${quantityMl}ml — prochain biberon dans ${interval}`;
}

export function getTeteeToast(
  minutes: number,
  sein: string,
  dateNaissance: string | null | undefined
): string {
  const interval =
    dateNaissance != null ? formatFeedingInterval(dateNaissance) : "2h-3h";
  const seinLabel = sein === "gauche" ? "sein gauche" : "sein droit";
  return `🤱 Tétée ${minutes}min (${seinLabel}) — prochain dans ${interval}`;
}

export function getRecommendedLabel(
  prenom: string,
  dateNaissance: string,
  poidsNaissance: number
): string {
  const age = formatExactBabyAge(dateNaissance);
  return `Recommandé pour ${prenom} à ${age} · ${poidsNaissance}kg`;
}

export function resolveBiberonInputMode(
  parcours: DemoParcours | null | undefined
): "choice" | "ml" | "tetee" {
  if (parcours === "allaite") return "tetee";
  if (parcours === "mixte") return "choice";
  return "ml";
}

export function serializeTeteeNote(sein: "gauche" | "droit", minutes: number): string {
  return JSON.stringify({ type: "tetee", sein, minutes });
}
