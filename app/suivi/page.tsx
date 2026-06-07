"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ModalSheet } from "@/components/ModalSheet";
import { isToday } from "@/lib/dashboard-messages";
import {
  deleteDemoEvent,
  fetchDemoEvents,
  getOrCreateSessionId,
  insertDemoEvent,
  updateDemoEvent,
} from "@/lib/demo";
import {
  deleteEvent,
  fetchEvents as fetchEventsFromDb,
  formatTimeShort,
  getEventEmoji,
  getEventLabel,
  insertEvent,
  updateEvent,
} from "@/lib/events";
import {
  calcDurationBetweenTimes,
  calcSleepMinutes,
  combineDateAndTime,
  formatDurationCompact,
  parseJsonNote,
  serializeNote,
  SOMMEIL_REVEIL_COUNTS,
  type SommeilMeta,
  toTimeInputValue,
} from "@/lib/sleep";
import type { BebebouEvent } from "@/lib/supabase";

type SuiviPeriod = "today" | "7days" | "30days";
type CoucheType = "pipi" | "caca" | "les_deux";
type PleureCause = "faim" | "couche" | "douleur" | "calin" | "inconnu";

type PleureMeta = {
  cause: PleureCause;
  duree_minutes?: number;
};

const PERIOD_OPTIONS: { id: SuiviPeriod; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7days", label: "7 jours" },
  { id: "30days", label: "30 jours" },
];

const TYPE_LABELS: Record<BebebouEvent["type"], string> = {
  biberon: "Biberon",
  couche: "Couche",
  sieste: "Sieste",
  pleure: "Pleurs",
  nuit: "Nuit",
};

const COUCHE_OPTIONS: { id: CoucheType; label: string }[] = [
  { id: "pipi", label: "💧 Pipi" },
  { id: "caca", label: "💩 Selle" },
  { id: "les_deux", label: "💧💩 Les deux" },
];

const PLEURE_CAUSES: { id: PleureCause; label: string }[] = [
  { id: "faim", label: "🍼 Faim" },
  { id: "couche", label: "💩 Couche" },
  { id: "douleur", label: "😣 Douleur" },
  { id: "calin", label: "🤗 Câlin" },
  { id: "inconnu", label: "❓ Inconnu" },
];

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: "#4A3F5C",
  marginBottom: 6,
  display: "block" as const,
};

const timeInputStyle = {
  width: "100%",
  borderRadius: 12,
  padding: "12px 16px",
  border: "1.5px solid #F0E8F5",
  fontSize: 15,
  color: "#4A3F5C",
  backgroundColor: "#FDF8F2",
  boxSizing: "border-box" as const,
  marginBottom: 16,
};

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function filterByPeriod(
  events: BebebouEvent[],
  period: SuiviPeriod
): BebebouEvent[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return events.filter((event) => {
    if (period === "today") return isToday(event.created_at);
    const age = now - new Date(event.created_at).getTime();
    if (period === "7days") return age <= 7 * dayMs;
    return age <= 30 * dayMs;
  });
}

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const isEventToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isEventToday) return formatTimeShort(date);

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventReferenceDate(event: BebebouEvent): Date {
  return new Date(event.created_at);
}

function parseSommeilTimeString(
  value: string | undefined,
  fallbackDate: Date
): string {
  if (!value) return toTimeInputValue(fallbackDate);
  if (value.includes("T")) return toTimeInputValue(new Date(value));
  return value;
}

function buildEventCreatedAt(event: BebebouEvent, time: string): string {
  return combineDateAndTime(eventReferenceDate(event), time).toISOString();
}

function buildSleepEndDateFromTimes(
  ref: Date,
  debut: string,
  fin: string
): Date {
  const start = combineDateAndTime(ref, debut);
  let end = combineDateAndTime(ref, fin);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return end;
}

function parseCoucheType(note: string | null): CoucheType {
  if (note === "caca") return "caca";
  if (note === "les_deux") return "les_deux";
  return "pipi";
}

function pleureCauseFromLegacyNote(note: string | null): PleureCause {
  if (!note) return "inconnu";
  const lower = note.toLowerCase();
  if (lower.includes("faim")) return "faim";
  if (lower.includes("couche")) return "couche";
  if (lower.includes("câlin") || lower.includes("calin")) return "calin";
  if (lower.includes("douleur") || lower.includes("fatigu")) return "douleur";
  return "inconnu";
}

function parsePleureFromEvent(event: BebebouEvent): {
  cause: PleureCause;
  duree: number;
} {
  const meta = parseJsonNote<PleureMeta>(event.note);
  if (meta?.cause) {
    return {
      cause: meta.cause,
      duree: meta.duree_minutes ?? event.quantity ?? 5,
    };
  }
  return {
    cause: pleureCauseFromLegacyNote(event.note),
    duree: event.quantity ?? 5,
  };
}

function isTeteeBiberon(event: BebebouEvent): boolean {
  if (event.type !== "biberon") return false;
  const tetee = parseJsonNote<{ type?: string }>(event.note);
  return tetee?.type === "tetee";
}

function choiceButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    borderRadius: 12,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 600,
    border: active ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
    backgroundColor: active ? "#E8406A" : "white",
    color: active ? "white" : "#4A3F5C",
    cursor: "pointer",
  };
}

export default function SuiviPage() {
  const router = useRouter();
  const [events, setEvents] = useState<BebebouEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<SuiviPeriod>("today");
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");
  const [editingEvent, setEditingEvent] = useState<BebebouEvent | null>(null);
  const [editTime, setEditTime] = useState("12:00");
  const [editMl, setEditMl] = useState("120");
  const [editCoucheType, setEditCoucheType] = useState<CoucheType>("pipi");
  const [editSleepDebut, setEditSleepDebut] = useState("12:00");
  const [editSleepFin, setEditSleepFin] = useState("13:00");
  const [editReveils, setEditReveils] = useState(0);
  const [editPleureDuration, setEditPleureDuration] = useState(5);
  const [editPleureCause, setEditPleureCause] = useState<PleureCause>("inconnu");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [sleepType, setSleepType] = useState<"sieste" | "nuit">("sieste");
  const [sleepDebut, setSleepDebut] = useState(() => toTimeInputValue());
  const [sleepFin, setSleepFin] = useState(() => toTimeInputValue());
  const [sleepReveils, setSleepReveils] = useState(0);

  const reloadEvents = useCallback(async () => {
    setError(null);
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      setIsAuthenticated(true);
      setUserId(user.id);
      const data = await fetchEventsFromDb(user.id);
      setEvents(data);

      const { data: profile } = await supabase
        .from("profiles")
        .select("family_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.family_id) {
        const { data: baby } = await supabase
          .from("babies")
          .select("id")
          .eq("family_id", profile.family_id)
          .maybeSingle();
        setBabyId(baby?.id ?? null);
      } else {
        setBabyId(null);
      }
      return;
    }

    setIsAuthenticated(false);
    setUserId(null);
    setBabyId(null);
    const sessionId = getOrCreateSessionId();
    setDemoSessionId(sessionId);
    const data = await fetchDemoEvents(sessionId);
    setEvents(data);
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      try {
        await reloadEvents();
      } catch (err) {
        console.error(err);
        setError("Impossible de charger l'historique");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [reloadEvents, router]);

  const filteredEvents = useMemo(
    () => filterByPeriod(events, period),
    [events, period]
  );

  const sleepEvents = useMemo(
    () =>
      filteredEvents.filter(
        (e) => e.type === "sieste" || e.type === "nuit"
      ),
    [filteredEvents]
  );

  const otherEvents = useMemo(
    () =>
      filteredEvents.filter(
        (e) => e.type !== "sieste" && e.type !== "nuit"
      ),
    [filteredEvents]
  );

  const sleepDurationMin = useMemo(() => {
    if (sleepType === "nuit") {
      return calcSleepMinutes(sleepDebut, sleepFin);
    }
    return calcDurationBetweenTimes(sleepDebut, sleepFin);
  }, [sleepType, sleepDebut, sleepFin]);

  const editMlValue = Math.min(
    350,
    Math.max(10, parseInt(editMl, 10) || 120)
  );

  const editSleepDurationMin = useMemo(() => {
    if (!editingEvent) return 0;
    if (editingEvent.type === "nuit") {
      return calcSleepMinutes(editSleepDebut, editSleepFin);
    }
    if (editingEvent.type === "sieste") {
      return calcDurationBetweenTimes(editSleepDebut, editSleepFin);
    }
    return 0;
  }, [editingEvent, editSleepDebut, editSleepFin]);

  function openEditModal(event: BebebouEvent) {
    const ref = eventReferenceDate(event);
    setEditingEvent(event);
    setModalError(null);

    switch (event.type) {
      case "biberon": {
        setEditTime(toTimeInputValue(ref));
        const qty = event.quantity ?? 120;
        if (isTeteeBiberon(event)) {
          setEditPleureDuration(qty);
        } else {
          setEditMl(String(qty));
        }
        break;
      }
      case "couche": {
        setEditTime(toTimeInputValue(ref));
        setEditCoucheType(parseCoucheType(event.note));
        break;
      }
      case "sieste":
      case "nuit": {
        const meta = parseJsonNote<SommeilMeta>(event.note);
        setEditSleepDebut(
          parseSommeilTimeString(meta?.heure_debut, ref)
        );
        setEditSleepFin(
          parseSommeilTimeString(
            meta?.heure_fin,
            buildSleepEndDateFromTimes(
              ref,
              parseSommeilTimeString(meta?.heure_debut, ref),
              parseSommeilTimeString(meta?.heure_fin, ref)
            )
          )
        );
        setEditReveils(meta?.nb_reveils ?? 0);
        break;
      }
      case "pleure": {
        const { cause, duree } = parsePleureFromEvent(event);
        setEditTime(toTimeInputValue(ref));
        setEditPleureCause(cause);
        setEditPleureDuration(duree);
        break;
      }
    }
  }

  function closeEditModal() {
    if (saving) return;
    setEditingEvent(null);
    setModalError(null);
  }

  function adjustEditMl(delta: number) {
    setEditMl(String(Math.min(350, Math.max(10, editMlValue + delta))));
  }

  function adjustPleureDuration(delta: number) {
    setEditPleureDuration((d) => Math.min(180, Math.max(1, d + delta)));
  }

  function buildEditPayload(event: BebebouEvent): {
    quantity: number | null;
    created_at: string;
    note: string | null;
  } {
    const ref = eventReferenceDate(event);

    switch (event.type) {
      case "biberon": {
        if (isTeteeBiberon(event)) {
          const tetee = parseJsonNote<{
            type?: string;
            sein?: string;
            minutes?: number;
          }>(event.note);
          const updatedNote = JSON.stringify({
            type: "tetee",
            sein: tetee?.sein ?? "gauche",
            minutes: editPleureDuration,
          });
          return {
            quantity: editPleureDuration,
            created_at: buildEventCreatedAt(event, editTime),
            note: updatedNote,
          };
        }
        return {
          quantity: editMlValue,
          created_at: buildEventCreatedAt(event, editTime),
          note: event.note,
        };
      }
      case "couche":
        return {
          quantity: null,
          created_at: buildEventCreatedAt(event, editTime),
          note: editCoucheType,
        };
      case "sieste": {
        const durationMin = Math.max(1, editSleepDurationMin);
        const meta: SommeilMeta = {
          heure_debut: editSleepDebut,
          heure_fin: editSleepFin,
          duree_minutes: durationMin,
        };
        return {
          quantity: durationMin,
          created_at: combineDateAndTime(ref, editSleepDebut).toISOString(),
          note: serializeNote(meta),
        };
      }
      case "nuit": {
        const durationMin = Math.max(1, editSleepDurationMin);
        const meta: SommeilMeta = {
          heure_debut: editSleepDebut,
          heure_fin: editSleepFin,
          nb_reveils: editReveils,
          duree_minutes: durationMin,
        };
        return {
          quantity: durationMin,
          created_at: buildSleepEndDateFromTimes(
            ref,
            editSleepDebut,
            editSleepFin
          ).toISOString(),
          note: serializeNote(meta),
        };
      }
      case "pleure": {
        const meta: PleureMeta = {
          cause: editPleureCause,
          duree_minutes: editPleureDuration,
        };
        return {
          quantity: editPleureDuration,
          created_at: buildEventCreatedAt(event, editTime),
          note: serializeNote(meta),
        };
      }
    }
  }

  async function handleSaveEdit() {
    if (!editingEvent) return;

    setSaving(true);
    setModalError(null);

    try {
      const payload = buildEditPayload(editingEvent);

      if (isAuthenticated) {
        await updateEvent(editingEvent.id, payload);
      } else {
        const sessionId = demoSessionId || getOrCreateSessionId();
        await updateDemoEvent(sessionId, editingEvent.id, payload);
      }

      await reloadEvents();
      setEditingEvent(null);
    } catch (err) {
      console.error(err);
      setModalError("Impossible de modifier cet enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEdit() {
    if (!editingEvent) return;
    if (!window.confirm("Supprimer cet enregistrement ?")) return;

    setSaving(true);
    setModalError(null);

    try {
      if (isAuthenticated) {
        await deleteEvent(editingEvent.id);
      } else {
        const sessionId = demoSessionId || getOrCreateSessionId();
        await deleteDemoEvent(sessionId, editingEvent.id);
      }

      await reloadEvents();
      setEditingEvent(null);
    } catch (err) {
      console.error(err);
      setModalError("Impossible de supprimer cet enregistrement");
    } finally {
      setSaving(false);
    }
  }

  function openSleepModal() {
    setSleepType("sieste");
    setSleepDebut(toTimeInputValue());
    setSleepFin(toTimeInputValue());
    setSleepReveils(0);
    setModalError(null);
    setShowSleepModal(true);
  }

  function closeSleepModal() {
    if (saving) return;
    setShowSleepModal(false);
    setModalError(null);
  }

  function buildSleepEndDate(debut: string, fin: string): Date {
    return buildSleepEndDateFromTimes(new Date(), debut, fin);
  }

  async function handleSaveSleep() {
    setSaving(true);
    setModalError(null);

    try {
      const durationMin = Math.max(1, sleepDurationMin);
      const meta: SommeilMeta = {
        heure_debut: sleepDebut,
        heure_fin: sleepFin,
        ...(sleepType === "nuit" ? { nb_reveils: sleepReveils } : {}),
      };
      const createdAt = buildSleepEndDate(sleepDebut, sleepFin).toISOString();
      const note = serializeNote(meta);

      if (isAuthenticated) {
        if (!userId) throw new Error("Utilisateur introuvable");
        await insertEvent({
          type: sleepType,
          note,
          quantity: durationMin,
          created_at: createdAt,
          user_id: userId,
          baby_id: babyId ?? undefined,
        });
      } else {
        const sessionId = demoSessionId || getOrCreateSessionId();
        await insertDemoEvent(
          sessionId,
          sleepType,
          note,
          durationMin,
          createdAt
        );
      }

      await reloadEvents();
      setShowSleepModal(false);
    } catch (err) {
      console.error(err);
      setModalError("Impossible d'enregistrer ce sommeil");
    } finally {
      setSaving(false);
    }
  }

  function renderEditFields() {
    if (!editingEvent) return null;

    switch (editingEvent.type) {
      case "biberon":
        return (
          <>
            <label style={labelStyle}>
              {isTeteeBiberon(editingEvent)
                ? "Heure de la tétée"
                : "Heure de prise"}
            </label>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              style={timeInputStyle}
            />
            <label style={labelStyle}>
              {isTeteeBiberon(editingEvent)
                ? "Durée (min)"
                : "Quantité (ml)"}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  isTeteeBiberon(editingEvent)
                    ? adjustPleureDuration(-5)
                    : adjustEditMl(-10)
                }
                disabled={saving}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  border: "1.5px solid #F0E8F8",
                  backgroundColor: "#FDF8F2",
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#4A3F5C",
                  cursor: "pointer",
                }}
              >
                −
              </button>
              <div
                style={{
                  minWidth: 120,
                  padding: "14px 20px",
                  borderRadius: 14,
                  border: "1px solid #E8E0F0",
                  textAlign: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#4A3F5C",
                  backgroundColor: "#FFFFFF",
                }}
              >
                {isTeteeBiberon(editingEvent)
                  ? `${editPleureDuration} min`
                  : `${editMlValue} ml`}
              </div>
              <button
                type="button"
                onClick={() =>
                  isTeteeBiberon(editingEvent)
                    ? adjustPleureDuration(5)
                    : adjustEditMl(10)
                }
                disabled={saving}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  border: "1.5px solid #F0E8F8",
                  backgroundColor: "#FDF8F2",
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#4A3F5C",
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
          </>
        );

      case "couche":
        return (
          <>
            <label style={labelStyle}>Heure</label>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              style={timeInputStyle}
            />
            <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>
              Type
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 24,
              }}
            >
              {COUCHE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEditCoucheType(opt.id)}
                  style={{
                    ...choiceButtonStyle(editCoucheType === opt.id),
                    flex: "1 1 30%",
                    minWidth: 90,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        );

      case "sieste":
        return (
          <>
            <label style={labelStyle}>Heure début</label>
            <input
              type="time"
              value={editSleepDebut}
              onChange={(e) => setEditSleepDebut(e.target.value)}
              style={timeInputStyle}
            />
            <label style={labelStyle}>Heure fin</label>
            <input
              type="time"
              value={editSleepFin}
              onChange={(e) => setEditSleepFin(e.target.value)}
              style={timeInputStyle}
            />
            <p
              style={{
                fontSize: 14,
                color: "#8B7FA0",
                textAlign: "center",
                margin: "0 0 24px",
              }}
            >
              Durée : {formatDurationCompact(editSleepDurationMin)}
            </p>
          </>
        );

      case "nuit":
        return (
          <>
            <label style={labelStyle}>Heure coucher</label>
            <input
              type="time"
              value={editSleepDebut}
              onChange={(e) => setEditSleepDebut(e.target.value)}
              style={timeInputStyle}
            />
            <label style={labelStyle}>Heure lever</label>
            <input
              type="time"
              value={editSleepFin}
              onChange={(e) => setEditSleepFin(e.target.value)}
              style={timeInputStyle}
            />
            <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>
              Nombre de réveils
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {SOMMEIL_REVEIL_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEditReveils(n)}
                  style={{
                    ...choiceButtonStyle(editReveils === n),
                    flex: "1 1 14%",
                    minWidth: 44,
                  }}
                >
                  {n === 5 ? "5+" : n}
                </button>
              ))}
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#8B7FA0",
                textAlign: "center",
                margin: "0 0 24px",
              }}
            >
              Durée totale : {formatDurationCompact(editSleepDurationMin)}
            </p>
          </>
        );

      case "pleure":
        return (
          <>
            <label style={labelStyle}>Heure début</label>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              style={timeInputStyle}
            />
            <label style={labelStyle}>Durée (minutes)</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => adjustPleureDuration(-5)}
                disabled={editPleureDuration <= 1 || saving}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  border: "1.5px solid #F0E8F8",
                  backgroundColor: "#FDF8F2",
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#4A3F5C",
                  cursor: editPleureDuration <= 1 ? "not-allowed" : "pointer",
                  opacity: editPleureDuration <= 1 ? 0.4 : 1,
                }}
              >
                −
              </button>
              <div
                style={{
                  minWidth: 120,
                  padding: "14px 20px",
                  borderRadius: 14,
                  border: "1px solid #E8E0F0",
                  textAlign: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#4A3F5C",
                  backgroundColor: "#FFFFFF",
                }}
              >
                {editPleureDuration} min
              </div>
              <button
                type="button"
                onClick={() => adjustPleureDuration(5)}
                disabled={editPleureDuration >= 180 || saving}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  border: "1.5px solid #F0E8F8",
                  backgroundColor: "#FDF8F2",
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#4A3F5C",
                  cursor: editPleureDuration >= 180 ? "not-allowed" : "pointer",
                  opacity: editPleureDuration >= 180 ? 0.4 : 1,
                }}
              >
                +
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>
              Cause
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 24,
              }}
            >
              {PLEURE_CAUSES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEditPleureCause(opt.id)}
                  style={{
                    ...choiceButtonStyle(editPleureCause === opt.id),
                    flex: "1 1 45%",
                    minWidth: 120,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        );

      default:
        return null;
    }
  }

  function renderEventRow(
    event: BebebouEvent,
    index: number,
    total: number
  ) {
    return (
      <li
        key={event.id}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 0",
          borderBottom: index < total - 1 ? "1px solid #F0E8F8" : "none",
        }}
      >
        <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>
          {getEventEmoji(event.type)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "#4A3F5C",
            }}
          >
            {TYPE_LABELS[event.type]}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#8B7FA0",
              lineHeight: 1.4,
            }}
          >
            {getEventLabel(event)}
          </p>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#8B7FA0",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {formatEventDate(event.created_at)}
        </span>
        <button
          type="button"
          onClick={() => openEditModal(event)}
          aria-label={`Modifier ${TYPE_LABELS[event.type]}`}
          style={{
            backgroundColor: "transparent",
            border: "none",
            fontSize: 18,
            cursor: "pointer",
            color: "#8B7FA0",
            flexShrink: 0,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✏️
        </button>
      </li>
    );
  }

  const editModalTitle = editingEvent
    ? `✏️ Modifier ${getEventEmoji(editingEvent.type)} ${TYPE_LABELS[editingEvent.type]}`
    : "";

  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        padding: "32px 16px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 448, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
            margin: "0 0 20px",
          }}
        >
          📊 Mon suivi
        </h1>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 14,
                border:
                  period === opt.id
                    ? "2px solid #E8406A"
                    : "1px solid #F0E8F8",
                backgroundColor: period === opt.id ? "#FFF0F4" : "white",
                color: period === opt.id ? "#E8406A" : "#8B7FA0",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <section
          style={{
            backgroundColor: "white",
            borderRadius: 24,
            padding: "20px 16px",
            boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                color: "#4A3F5C",
              }}
            >
              😴 Sommeil
            </h2>
            <button
              type="button"
              onClick={openSleepModal}
              disabled={loading}
              style={{
                border: "none",
                borderRadius: 12,
                padding: "8px 12px",
                backgroundColor: "#EEE8FF",
                color: "#6B5B95",
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              + Ajouter un sommeil
            </button>
          </div>

          {loading ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Chargement...
            </p>
          ) : sleepEvents.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Aucun sommeil pour cette période
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {sleepEvents.map((event, index) =>
                renderEventRow(event, index, sleepEvents.length)
              )}
            </ul>
          )}
        </section>

        <section
          style={{
            backgroundColor: "white",
            borderRadius: 24,
            padding: "20px 16px",
            boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
          }}
        >
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 16,
              fontWeight: 800,
              color: "#4A3F5C",
            }}
          >
            📋 Historique
          </h2>
          {loading ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Chargement...
            </p>
          ) : error ? (
            <p style={{ fontSize: 14, color: "#C03060", textAlign: "center" }}>
              {error}
            </p>
          ) : otherEvents.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Aucun autre événement pour cette période
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {otherEvents.map((event, index) =>
                renderEventRow(event, index, otherEvents.length)
              )}
            </ul>
          )}
        </section>
      </div>

      <ModalSheet
        open={Boolean(editingEvent)}
        onClose={closeEditModal}
        centered
        sheetStyle={{ padding: 24 }}
      >
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          {editModalTitle}
        </h2>

        {renderEditFields()}

        {modalError && (
          <p
            style={{
              fontSize: 13,
              color: "#C03060",
              textAlign: "center",
              margin: "0 0 16px",
            }}
          >
            {modalError}
          </p>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={closeEditModal}
            disabled={saving}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 14,
              border: "1.5px solid #F0E8F8",
              backgroundColor: "white",
              color: "#4A3F5C",
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={saving}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 14,
              border: "none",
              backgroundColor: "#E8406A",
              color: "white",
              fontSize: 15,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            Enregistrer ✓
          </button>
        </div>

        <button
          type="button"
          onClick={handleDeleteEdit}
          disabled={saving}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 12,
            borderRadius: 14,
            border: "none",
            backgroundColor: "transparent",
            color: "#FF6B6B",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          🗑️ Supprimer
        </button>
      </ModalSheet>

      <ModalSheet open={showSleepModal} onClose={closeSleepModal} centered>
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          + Ajouter un sommeil
        </h2>

        <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>Type</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {(["sieste", "nuit"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSleepType(type)}
              style={{
                flex: 1,
                padding: "12px 8px",
                borderRadius: 14,
                border:
                  sleepType === type
                    ? "2px solid #9B59B6"
                    : "1.5px solid #F0E8F8",
                backgroundColor: sleepType === type ? "#EEE8FF" : "white",
                color: "#4A3F5C",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {type === "sieste" ? "😴 Sieste" : "🌙 Nuit"}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Heure début</label>
        <input
          type="time"
          value={sleepDebut}
          onChange={(e) => setSleepDebut(e.target.value)}
          style={timeInputStyle}
        />

        <label style={labelStyle}>Heure fin</label>
        <input
          type="time"
          value={sleepFin}
          onChange={(e) => setSleepFin(e.target.value)}
          style={{
            ...timeInputStyle,
            marginBottom: sleepType === "nuit" ? 16 : 20,
          }}
        />

        {sleepType === "nuit" && (
          <>
            <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>
              Nombre de réveils
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {SOMMEIL_REVEIL_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSleepReveils(n)}
                  style={{
                    ...choiceButtonStyle(sleepReveils === n),
                    flex: "1 1 14%",
                    minWidth: 44,
                  }}
                >
                  {n === 5 ? "5+" : n}
                </button>
              ))}
            </div>
          </>
        )}

        <p
          style={{
            fontSize: 14,
            color: "#8B7FA0",
            textAlign: "center",
            margin: "0 0 20px",
          }}
        >
          Durée : {formatDurationCompact(sleepDurationMin)}
        </p>

        {modalError && (
          <p
            style={{
              fontSize: 13,
              color: "#C03060",
              textAlign: "center",
              margin: "0 0 16px",
            }}
          >
            {modalError}
          </p>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={closeSleepModal}
            disabled={saving}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 14,
              border: "1.5px solid #F0E8F8",
              backgroundColor: "white",
              color: "#4A3F5C",
              fontSize: 15,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSaveSleep}
            disabled={saving}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 14,
              border: "none",
              backgroundColor: "#9B59B6",
              color: "white",
              fontSize: 15,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            Enregistrer ✓
          </button>
        </div>
      </ModalSheet>
    </main>
  );
}
