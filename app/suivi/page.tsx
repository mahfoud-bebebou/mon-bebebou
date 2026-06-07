"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: "#4A3F5C",
  marginBottom: 6,
  display: "block" as const,
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

function isEditableBiberon(event: BebebouEvent): boolean {
  if (event.type !== "biberon") return false;
  const tetee = parseJsonNote<{ type?: string }>(event.note);
  return tetee?.type !== "tetee";
}

export default function SuiviPage() {
  const [events, setEvents] = useState<BebebouEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<SuiviPeriod>("today");
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");
  const [editingEvent, setEditingEvent] = useState<BebebouEvent | null>(null);
  const [editTime, setEditTime] = useState("12:00");
  const [editMl, setEditMl] = useState("120");
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
    async function load() {
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

    load();
  }, [reloadEvents]);

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

  function openEditModal(event: BebebouEvent) {
    setEditingEvent(event);
    setEditTime(toTimeInputValue(new Date(event.created_at)));
    setEditMl(String(event.quantity ?? 120));
    setModalError(null);
  }

  function closeEditModal() {
    if (saving) return;
    setEditingEvent(null);
    setModalError(null);
  }

  function adjustEditMl(delta: number) {
    setEditMl(String(Math.min(350, Math.max(10, editMlValue + delta))));
  }

  async function handleSaveEdit() {
    if (!editingEvent) return;

    setSaving(true);
    setModalError(null);

    try {
      const createdAt = combineDateAndTime(
        new Date(editingEvent.created_at),
        editTime
      ).toISOString();

      const payload = {
        quantity: editMlValue,
        created_at: createdAt,
      };

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
      setModalError("Impossible de modifier ce biberon");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEdit() {
    if (!editingEvent) return;
    if (!window.confirm("Supprimer ce biberon ?")) return;

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
      setModalError("Impossible de supprimer ce biberon");
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
    const ref = new Date();
    const start = combineDateAndTime(ref, debut);
    let end = combineDateAndTime(ref, fin);
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    return end;
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

  function renderEventRow(
    event: BebebouEvent,
    index: number,
    total: number,
    showEdit?: boolean
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
        {showEdit && isEditableBiberon(event) && (
          <button
            type="button"
            onClick={() => openEditModal(event)}
            aria-label="Modifier ce biberon"
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
        )}
      </li>
    );
  }

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
                renderEventRow(event, index, otherEvents.length, true)
              )}
            </ul>
          )}
        </section>
      </div>

      <ModalSheet open={Boolean(editingEvent)} onClose={closeEditModal} centered>
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          ✏️ Modifier ce biberon
        </h2>

        <label style={labelStyle}>Heure</label>
        <input
          type="time"
          value={editTime}
          onChange={(e) => setEditTime(e.target.value)}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "12px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 15,
            color: "#4A3F5C",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
            marginBottom: 20,
          }}
        />

        <label style={labelStyle}>Quantité (ml)</label>
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
            onClick={() => adjustEditMl(-10)}
            disabled={editMlValue <= 10 || saving}
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: "1.5px solid #F0E8F8",
              backgroundColor: "#FDF8F2",
              fontSize: 24,
              fontWeight: 600,
              color: "#4A3F5C",
              cursor: editMlValue <= 10 ? "not-allowed" : "pointer",
              opacity: editMlValue <= 10 ? 0.4 : 1,
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
            {editMlValue} ml
          </div>
          <button
            type="button"
            onClick={() => adjustEditMl(10)}
            disabled={editMlValue >= 350 || saving}
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: "1.5px solid #F0E8F8",
              backgroundColor: "#FDF8F2",
              fontSize: 24,
              fontWeight: 600,
              color: "#4A3F5C",
              cursor: editMlValue >= 350 ? "not-allowed" : "pointer",
              opacity: editMlValue >= 350 ? 0.4 : 1,
            }}
          >
            +
          </button>
        </div>

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
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "12px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 15,
            color: "#4A3F5C",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
        />

        <label style={labelStyle}>Heure fin</label>
        <input
          type="time"
          value={sleepFin}
          onChange={(e) => setSleepFin(e.target.value)}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "12px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 15,
            color: "#4A3F5C",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
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
                    flex: "1 1 14%",
                    minWidth: 44,
                    borderRadius: 12,
                    padding: "10px 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    border:
                      sleepReveils === n
                        ? "2px solid #E8406A"
                        : "1.5px solid #F0E8F5",
                    backgroundColor: sleepReveils === n ? "#E8406A" : "white",
                    color: sleepReveils === n ? "white" : "#4A3F5C",
                    cursor: "pointer",
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
