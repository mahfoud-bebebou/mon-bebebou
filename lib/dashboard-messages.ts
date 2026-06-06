import {
  formatExactBabyAge,
  formatFeedingInterval,
  getRecommendedMl,
  type DemoBaby,
  type DemoParcours,
} from "./demo";
import type { BebebouEvent, EventType } from "./supabase";
import { formatTimeShort } from "./events";

export type BabyMessageContext = {
  prenom: string;
  sexe?: "fille" | "garcon" | null;
  date_naissance?: string | null;
  poids_naissance?: number | null;
  poids_actuel?: number | null;
  parcours?: DemoParcours | null;
};

export type ContextualMessage = {
  emoji: string;
  text: string;
};

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function countTodayEvents(
  events: BebebouEvent[],
  type: EventType
): number {
  return events.filter((e) => e.type === type && isToday(e.created_at)).length;
}

function genderSuffix(sexe?: "fille" | "garcon" | null): string {
  if (sexe === "fille") return "e";
  return "";
}

function toDemoBabyLike(ctx: BabyMessageContext): DemoBaby | null {
  if (!ctx.date_naissance || !ctx.poids_actuel || !ctx.sexe) return null;
  return {
    session_id: "",
    prenom: ctx.prenom,
    sexe: ctx.sexe,
    date_naissance: ctx.date_naissance,
    poids_naissance: ctx.poids_naissance ?? ctx.poids_actuel,
    poids_actuel: ctx.poids_actuel,
    parcours: ctx.parcours ?? "artificiel",
  };
}

export function getContextualMessage(
  baby: BabyMessageContext,
  events: BebebouEvent[]
): ContextualMessage | null {
  if (!baby.prenom) return null;

  const todayEvents = events.filter((e) => isToday(e.created_at));
  const lastEvent = events[0];
  const demoLike = toDemoBabyLike(baby);

  const lastBiberon = events.find((e) => e.type === "biberon");
  if (lastBiberon) {
    const minsAgo =
      (Date.now() - new Date(lastBiberon.created_at).getTime()) / 60000;
    if (minsAgo < 30) {
      const qty = lastBiberon.quantity ?? "?";
      const heure = formatTimeShort(new Date(lastBiberon.created_at));
      return {
        emoji: "🌟",
        text: `Bien joué ! ${qty}ml à ${heure} — ${baby.prenom} est bien nourri${genderSuffix(baby.sexe)} pour ce matin`,
      };
    }
  }

  if (todayEvents.length === 0 && demoLike) {
    const age = formatExactBabyAge(demoLike.date_naissance);
    const qty = getRecommendedMl(demoLike);
    const interval = formatFeedingInterval(demoLike.date_naissance);
    return {
      emoji: "🍼",
      text: `Bonjour ! ${baby.prenom} a ${age} — à cet âge les bébés prennent environ ${qty}ml toutes les ${interval}. Enregistrez le premier biberon de la journée`,
    };
  }

  if (todayEvents.length === 0 && baby.date_naissance) {
    const age = formatExactBabyAge(baby.date_naissance);
    const interval = formatFeedingInterval(baby.date_naissance);
    return {
      emoji: "🍼",
      text: `Bonjour ! ${baby.prenom} a ${age} — à cet âge les bébés prennent un biberon toutes les ${interval}. Enregistrez le premier biberon de la journée`,
    };
  }

  if (lastEvent?.type === "couche") {
    const heure = formatTimeShort(new Date(lastEvent.created_at));
    return {
      emoji: "✅",
      text: `Couche changée à ${heure} — ${baby.prenom} est au sec !`,
    };
  }

  return null;
}

export function getEventToastMessage(
  type: EventType,
  baby: BabyMessageContext,
  note?: string,
  quantity?: number
): string {
  const heure = formatTimeShort(new Date());
  const interval =
    baby.date_naissance != null
      ? formatFeedingInterval(baby.date_naissance)
      : "2h-3h";

  switch (type) {
    case "biberon":
      return `🍼 ${quantity ?? "?"}ml enregistré — prochain biberon dans ${interval} !`;
    case "couche":
      if (note === "caca") {
        return "✅ Bonne vidange ! Tout va bien 😊";
      }
      return `✅ Couche changée — ${baby.prenom} est au sec !`;
    case "sieste":
      return `🌙 Sieste démarrée à ${heure}`;
    case "nuit":
      return `🌙 Nuit enregistrée pour ${baby.prenom}`;
    case "pleure":
      return "💛 On cherche la cause ensemble...";
  }
}
