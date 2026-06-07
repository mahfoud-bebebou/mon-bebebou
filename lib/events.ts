import {
  getTimelineEventLabel,
  parseJsonNote,
  type SiesteNoteData,
} from "./sleep";
import { BebebouEvent, EventType, supabase } from "./supabase";

export async function fetchEvents(userId: string): Promise<BebebouEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export type EventUpdatePayload = {
  quantity?: number | null;
  created_at?: string;
  note?: string | null;
};

export type EventInsertPayload = {
  type: EventType;
  note?: string | null;
  quantity?: number | null;
  created_at?: string;
  baby_id?: string;
  user_id: string;
};

export async function insertEvent(payload: EventInsertPayload): Promise<void> {
  const { error } = await supabase.from("events").insert({
    type: payload.type,
    note: payload.note ?? null,
    quantity: payload.quantity ?? null,
    user_id: payload.user_id,
    baby_id: payload.baby_id ?? null,
    created_at: payload.created_at ?? new Date().toISOString(),
  });

  if (error) throw error;
}

export async function updateEvent(
  eventId: string,
  payload: EventUpdatePayload
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update(payload)
    .eq("id", eventId);

  if (error) throw error;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw error;
}

export function formatTimeShort(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}h${minutes}`;
}

export function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const totalMinutes = Math.floor(diffMs / 60000);

  if (totalMinutes < 1) return "à l'instant";
  if (totalMinutes < 60) return `il y a ${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `il y a ${hours}h`;
  return `il y a ${hours}h${minutes.toString().padStart(2, "0")}`;
}

const EVENT_EMOJI: Record<EventType, string> = {
  biberon: "🍼",
  couche: "🌿",
  sieste: "🌙",
  pleure: "😢",
  nuit: "🌙",
};

export function getEventEmoji(type: EventType): string {
  return EVENT_EMOJI[type];
}

export function getEventLabel(event: BebebouEvent): string {
  switch (event.type) {
    case "biberon": {
      const tetee = parseJsonNote<{ type?: string; sein?: string; minutes?: number }>(
        event.note
      );
      if (tetee?.type === "tetee" && tetee.minutes) {
        const sein =
          tetee.sein === "gauche"
            ? "sein gauche"
            : tetee.sein === "droit"
              ? "sein droit"
              : "";
        return sein
          ? `Tétée ${tetee.minutes}min (${sein})`
          : `Tétée ${tetee.minutes}min`;
      }
      return event.quantity ? `Biberon ${event.quantity}ml` : "Biberon";
    }
    case "couche": {
      if (event.note === "caca") return "Changement de couche — Selle";
      if (event.note === "les_deux") return "Changement de couche — Pipi + Selle";
      if (event.note === "pipi") return "Changement de couche — Pipi";
      return event.note
        ? `Changement de couche — ${event.note}`
        : "Changement de couche";
    }
    case "sieste": {
      if (event.quantity) {
        return getTimelineEventLabel(event) || `Sieste · ${event.quantity}min`;
      }
      const data = parseJsonNote<SiesteNoteData>(event.note);
      if (data?.durationMin) {
        return getTimelineEventLabel(event) || "Sieste";
      }
      return getTimelineEventLabel(event) || "Sieste";
    }
    case "nuit":
      return getTimelineEventLabel(event) || "Nuit";
    case "pleure": {
      const meta = parseJsonNote<{ cause?: string; duree_minutes?: number }>(
        event.note
      );
      if (meta?.cause) {
        const causeLabels: Record<string, string> = {
          faim: "Faim",
          couche: "Couche",
          douleur: "Douleur",
          calin: "Câlin",
          inconnu: "Inconnu",
        };
        const label = causeLabels[meta.cause] ?? meta.cause;
        const duree = meta.duree_minutes ?? event.quantity;
        return duree
          ? `Pleurs · ${label} · ${duree}min`
          : `Pleurs · ${label}`;
      }
      return event.note ?? "Bébé pleure";
    }
  }
}

export function getCardSubtitle(
  type: EventType,
  events: BebebouEvent[]
): string {
  const last = events.find((e) => e.type === type);
  if (!last) return "Aucun enregistrement";

  const ago = timeAgo(new Date(last.created_at));
  if (type === "sieste" || type === "nuit") {
    const extra = getTimelineEventLabel(last);
    if (extra) return `${extra} · ${ago}`;
  }
  return `Dernière fois : ${ago}`;
}

export function getBiberonAlert(events: BebebouEvent[]): string {
  const lastBiberon = events.find((e) => e.type === "biberon");
  if (!lastBiberon) {
    return "Aucun biberon enregistré pour le moment";
  }
  const ago = timeAgo(new Date(lastBiberon.created_at));
  return `Dernier biberon ${ago} — bébé va bientôt avoir faim`;
}
