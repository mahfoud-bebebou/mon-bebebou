"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { isToday } from "@/lib/dashboard-messages";
import { fetchDemoEvents, getOrCreateSessionId } from "@/lib/demo";
import {
  fetchEvents as fetchEventsFromDb,
  formatTimeShort,
  getEventEmoji,
  getEventLabel,
} from "@/lib/events";
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

export default function SuiviPage() {
  const [events, setEvents] = useState<BebebouEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<SuiviPeriod>("today");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const data = await fetchEventsFromDb(user.id);
          setEvents(data);
        } else {
          const sessionId = getOrCreateSessionId();
          const data = await fetchDemoEvents(sessionId);
          setEvents(data);
        }
      } catch (err) {
        console.error(err);
        setError("Impossible de charger l'historique");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredEvents = useMemo(
    () => filterByPeriod(events, period),
    [events, period]
  );

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
          }}
        >
          {loading ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Chargement...
            </p>
          ) : error ? (
            <p style={{ fontSize: 14, color: "#C03060", textAlign: "center" }}>
              {error}
            </p>
          ) : filteredEvents.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Aucun événement pour cette période
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {filteredEvents.map((event, index) => (
                <li
                  key={event.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom:
                      index < filteredEvents.length - 1
                        ? "1px solid #F0E8F8"
                        : "none",
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
