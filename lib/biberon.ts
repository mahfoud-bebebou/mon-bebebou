import {
  formatExactBabyAge,
  formatFeedingInterval,
  getBottlesPerDay,
  getFeedingIntervalMinutes,
  type DemoParcours,
} from "./demo";

export type BiberonFeedback = {
  message: string;
  backgroundColor: string;
};

export type BiberonCountdown = {
  label: string;
  overdue: boolean;
};

export function getRecommendedMlFromProfile(
  poids: number,
  dateNaissance: string
): number {
  const nbBiberons = getBottlesPerDay(dateNaissance);
  const raw = (poids * 150) / nbBiberons;
  return Math.round(raw / 10) * 10;
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

export function getBiberonCountdown(
  lastBiberonAt: string | null,
  dateNaissance: string | null | undefined
): BiberonCountdown | null {
  if (!lastBiberonAt || !dateNaissance) return null;

  const intervalMin = getFeedingIntervalMinutes(dateNaissance);
  const target =
    new Date(lastBiberonAt).getTime() + intervalMin * 60 * 1000;
  const remaining = target - Date.now();

  if (remaining <= 0) {
    return { label: "C'est l'heure !", overdue: true };
  }

  const totalMin = Math.ceil(remaining / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours > 0) {
    return {
      label: `Prochain dans ${hours}h${mins.toString().padStart(2, "0")}`,
      overdue: false,
    };
  }
  return { label: `Prochain dans ${mins} min`, overdue: false };
}

export function formatBiberonCountdownTimer(
  lastBiberonAt: string | null,
  dateNaissance: string | null | undefined
): string | null {
  if (!lastBiberonAt || !dateNaissance) return null;

  const intervalMin = getFeedingIntervalMinutes(dateNaissance);
  const target =
    new Date(lastBiberonAt).getTime() + intervalMin * 60 * 1000;
  const remaining = Math.max(0, target - Date.now());
  const totalSec = Math.ceil(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (remaining <= 0) return "00:00";
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
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
