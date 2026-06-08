"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";
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
import {
  getCoucheHoursAlert,
  getDefaultUserSettings,
  isCoparentNotifEnabled,
  loadSettingsFromLocalStorage,
  loadUserSettings,
  mergeUserSettings,
  type UserSettings,
} from "@/lib/user-settings";
import {
  type FamilyMemberProfile,
  getMemberPrenom,
} from "@/lib/family";
import { getRoleLabel } from "@/lib/roles";

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

const CATEGORIES = [
  { id: "tout", label: "Tout", emoji: "📋" },
  { id: "biberon", label: "Biberon", emoji: "🍼" },
  { id: "couche", label: "Couche", emoji: "🌿" },
  { id: "sieste", label: "Sieste", emoji: "😴" },
  { id: "nuit", label: "Nuit", emoji: "🌙" },
  { id: "pleurs", label: "Pleurs", emoji: "😢" },
] as const;

type CategorieId = (typeof CATEGORIES)[number]["id"];

const TYPE_LABELS: Record<BebebouEvent["type"], string> = {
  biberon: "Biberon",
  couche: "Couche",
  sieste: "Sieste",
  pleure: "Pleurs",
  nuit: "Nuit",
  sieste_active: "Sieste en cours",
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

const NUIT_REVEIL_RAISON_OPTIONS = [
  { id: "faim", label: "🍼 Faim" },
  { id: "couche", label: "💩 Couche" },
  { id: "douleur", label: "😣 Douleur" },
  { id: "cauchemar", label: "😰 Cauchemar" },
  { id: "calin", label: "🤗 Câlin" },
  { id: "inconnu", label: "❓ Inconnu" },
] as const;

type NuitSommeilMeta = SommeilMeta & {
  heure_coucher?: string;
  heure_lever?: string;
  raisons_reveils?: unknown;
};

function normalizeReveilRaisons(raw: unknown, count: number): string[][] {
  if (!Array.isArray(raw)) {
    return Array.from({ length: count }, () => []);
  }
  return Array.from({ length: count }, (_, index) => {
    const item = raw[index];
    if (Array.isArray(item)) {
      return item.filter((value): value is string => typeof value === "string");
    }
    if (typeof item === "string" && item) return [item];
    return [];
  });
}

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

function formatTimelineHour(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`;
}

function matchesCategory(event: BebebouEvent, categorieActive: CategorieId): boolean {
  if (categorieActive === "tout") return true;
  if (categorieActive === "pleurs") return event.type === "pleure";
  return event.type === categorieActive;
}

function isValidCategorieId(value: string | null): value is CategorieId {
  return CATEGORIES.some((c) => c.id === value);
}

function getEventSortTime(event: BebebouEvent): number {
  if (event.type === "nuit") {
    const meta = parseJsonNote<NuitSommeilMeta>(event.note);
    const heureCoucher = meta?.heure_coucher;
    if (heureCoucher) {
      const [h, m] = heureCoucher.split(":");
      const d = new Date(event.created_at);
      d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
      if (parseInt(h, 10) >= 20) d.setDate(d.getDate() - 1);
      return d.getTime();
    }
  }
  return new Date(event.created_at).getTime();
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
  return (
    <Suspense
      fallback={
        <main
          style={{
            backgroundColor: "#FDF8F2",
            minHeight: "100vh",
            padding: "32px 16px 24px",
            boxSizing: "border-box",
          }}
        >
          <p style={{ textAlign: "center", color: "#8B7FA0", fontSize: 14 }}>
            Chargement...
          </p>
        </main>
      }
    >
      <SuiviPageContent />
    </Suspense>
  );
}

function SuiviPageContent() {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<BebebouEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<SuiviPeriod>("today");
  const [categorieActive, setCategorieActive] = useState<CategorieId>("tout");
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
  const [editReveilRaisons, setEditReveilRaisons] = useState<string[][]>([]);
  const [editPleureDuration, setEditPleureDuration] = useState(5);
  const [editPleureCause, setEditPleureCause] = useState<PleureCause>("inconnu");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [babyPrenom, setBabyPrenom] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(() =>
    mergeUserSettings(getDefaultUserSettings(), loadSettingsFromLocalStorage())
  );
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberProfile[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [sleepType, setSleepType] = useState<"sieste" | "nuit">("sieste");
  const [sleepDebut, setSleepDebut] = useState(() => toTimeInputValue());
  const [sleepFin, setSleepFin] = useState(() => toTimeInputValue());
  const [sleepReveils, setSleepReveils] = useState(0);

  const loadData = useCallback(async () => {
    setError(null);
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsAuthenticated(false);
      setUserId(null);
      setBabyId(null);
      setBabyPrenom(null);
      setFamilyMembers([]);
      const sessionId = getOrCreateSessionId();
      setDemoSessionId(sessionId);
      const data = await fetchDemoEvents(sessionId);
      setEvents(data);
      return;
    }

    setIsAuthenticated(true);
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", user.id)
      .single();

    if (!profile?.family_id) {
      setEvents([]);
      return;
    }

    const { data: membresData } = await supabase
      .from("profiles")
      .select("id, prenom, prenom_maman, prenom_papa, role")
      .eq("family_id", profile.family_id);
    if (membresData) {
      setFamilyMembers(membresData as FamilyMemberProfile[]);
    }

    const { data: baby } = await supabase
      .from("babies")
      .select("*")
      .eq("family_id", profile.family_id)
      .single();

    if (!baby) {
      setEvents([]);
      return;
    }

    setBabyId(baby.id);
    setBabyPrenom(baby.prenom ?? null);

    const dateDebut = new Date();
    if (period === "today") {
      dateDebut.setHours(0, 0, 0, 0);
    } else if (period === "7days") {
      dateDebut.setDate(dateDebut.getDate() - 7);
    } else if (period === "30days") {
      dateDebut.setDate(dateDebut.getDate() - 30);
    }

    const { data: eventsData, error: eventsError } = await supabase
      .from("events")
      .select("*")
      .eq("baby_id", baby.id)
      .neq("type", "sieste_active")
      .gte("created_at", dateDebut.toISOString())
      .order("created_at", { ascending: false });

    if (eventsError) throw eventsError;
    if (eventsData) setEvents(eventsData);
  }, [period]);

  const showToast = useCallback(
    (message: string, options?: { coparent?: boolean }) => {
      if (options?.coparent && !isCoparentNotifEnabled(userSettings)) return;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage(message);
      setToastVisible(true);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        setToastMessage(null);
      }, 3000);
    },
    [userSettings]
  );

  useEffect(() => {
    const local = loadSettingsFromLocalStorage();
    if (local) {
      setUserSettings(mergeUserSettings(getDefaultUserSettings(), local));
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const supabase = createSupabaseClient();
    void loadUserSettings(supabase, userId).then(setUserSettings);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (!isAuthenticated || !babyId || !userId) return;

    const supabase = createSupabaseClient();
    const currentUserId = userId;

    const channel = supabase
      .channel(`suivi-events-${babyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => {
          const newEvent = payload.new as BebebouEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [newEvent, ...prev];
          });

          if (
            newEvent.user_id &&
            newEvent.user_id !== currentUserId &&
            newEvent.type !== "sieste_active"
          ) {
            const label = getEventLabel(newEvent);
            const membre = familyMembers.find((m) => m.id === newEvent.user_id);
            const roleInfo = getRoleLabel(membre?.role);
            const prenom = membre ? getMemberPrenom(membre) : "Quelqu'un";
            showToast(
              `${roleInfo.emoji} ${prenom} vient d'enregistrer ${label}`,
              { coparent: true }
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [babyId, isAuthenticated, userId, showToast, familyMembers]);

  const coucheAlert = useMemo(() => {
    if (!isAuthenticated || !babyPrenom) return null;
    return getCoucheHoursAlert(events, userSettings, babyPrenom);
  }, [events, userSettings, isAuthenticated, babyPrenom]);

  useEffect(() => {
    async function run() {
      try {
        await loadData();
      } catch (err) {
        console.error(err);
        setError("Impossible de charger l'historique");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [loadData]);

  useEffect(() => {
    const categorieParam = searchParams.get("categorie");
    if (categorieParam && isValidCategorieId(categorieParam)) {
      setCategorieActive(categorieParam);
    }
  }, [searchParams]);

  const filteredEvents = useMemo(
    () => filterByPeriod(events, period),
    [events, period]
  );

  const evenementsFiltres = useMemo(
    () =>
      filteredEvents
        .filter((e) => matchesCategory(e, categorieActive))
        .sort((a, b) => getEventSortTime(b) - getEventSortTime(a)),
    [filteredEvents, categorieActive]
  );

  const sleepEvents = useMemo(
    () =>
      filteredEvents.filter(
        (e) => e.type === "sieste" || e.type === "nuit"
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
        const meta = parseJsonNote<NuitSommeilMeta>(event.note);
        setEditSleepDebut(
          parseSommeilTimeString(
            meta?.heure_debut ?? meta?.heure_coucher,
            ref
          )
        );
        setEditSleepFin(
          parseSommeilTimeString(
            meta?.heure_fin ?? meta?.heure_lever,
            buildSleepEndDateFromTimes(
              ref,
              parseSommeilTimeString(
                meta?.heure_debut ?? meta?.heure_coucher,
                ref
              ),
              parseSommeilTimeString(meta?.heure_fin ?? meta?.heure_lever, ref)
            )
          )
        );
        const reveils = meta?.nb_reveils ?? 0;
        setEditReveils(reveils);
        if (event.type === "nuit") {
          setEditReveilRaisons(
            normalizeReveilRaisons(meta?.raisons_reveils, reveils)
          );
        } else {
          setEditReveilRaisons([]);
        }
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

  function handleEditReveilCountChange(count: number) {
    setEditReveils(count);
    setEditReveilRaisons((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push([]);
      return next;
    });
  }

  function toggleEditReveilRaison(wakeIndex: number, raisonId: string) {
    setEditReveilRaisons((prev) => {
      const next = prev.slice();
      while (next.length <= wakeIndex) next.push([]);
      const selected = next[wakeIndex] ?? [];
      next[wakeIndex] = selected.includes(raisonId)
        ? selected.filter((id) => id !== raisonId)
        : [...selected, raisonId];
      return next;
    });
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
        const existingMeta =
          parseJsonNote<NuitSommeilMeta>(event.note) ?? {};
        const durationMin = Math.max(1, editSleepDurationMin);
        const meta = {
          ...existingMeta,
          heure_debut: editSleepDebut,
          heure_fin: editSleepFin,
          heure_coucher: editSleepDebut,
          heure_lever: editSleepFin,
          nb_reveils: editReveils,
          raisons_reveils: editReveilRaisons.slice(0, editReveils),
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

      await loadData();
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

      await loadData();
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
        if (!userId || !babyId) throw new Error("Profil bébé introuvable");
        await insertEvent({
          type: sleepType,
          note,
          quantity: durationMin,
          created_at: createdAt,
          user_id: userId,
          baby_id: babyId,
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

      await loadData();
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
                  onClick={() => handleEditReveilCountChange(n)}
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
            {editReveils > 0 &&
              Array.from({ length: editReveils }, (_, wakeIndex) => (
                <div key={wakeIndex} style={{ marginBottom: 16 }}>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#8B7FA0",
                      margin: "0 0 8px",
                    }}
                  >
                    Raison du réveil {wakeIndex + 1}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {NUIT_REVEIL_RAISON_OPTIONS.map((opt) => {
                      const selected = (
                        editReveilRaisons[wakeIndex] ?? []
                      ).includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            toggleEditReveilRaison(wakeIndex, opt.id)
                          }
                          style={{
                            borderRadius: 12,
                            padding: "8px 12px",
                            fontSize: 13,
                            fontWeight: 600,
                            border: selected
                              ? "1.5px solid #E8406A"
                              : "1.5px solid #F0E8F5",
                            backgroundColor: selected ? "#E8406A" : "white",
                            color: selected ? "white" : "#4A3F5C",
                            cursor: "pointer",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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

  function renderTimelineRow(event: BebebouEvent, index: number, total: number) {
    return (
        <li
        key={event.id}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "12px 0 12px 8",
          borderBottom: index < total - 1 ? "1px solid #F0E8F8" : "none",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#8B7FA0",
            fontWeight: 600,
            minWidth: 48,
            flexShrink: 0,
            paddingTop: 2,
          }}
        >
          {formatTimelineHour(event.created_at)}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
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
        </div>
      </li>
    );
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

        {!isAuthenticated && !loading && (
          <div
            style={{
              backgroundColor: "#FDF0F5",
              border: "1px solid #F0E8F5",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 13,
              color: "#8B7FA0",
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            👀 Aperçu de votre journée en mode démo
          </div>
        )}

        {isAuthenticated && coucheAlert && (
          <div
            style={{
              backgroundColor: "#F5A623",
              color: "white",
              borderRadius: 16,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
              marginBottom: 20,
              boxShadow: "0 4px 16px rgba(74,63,92,0.12)",
            }}
          >
            {coucheAlert.message}
          </div>
        )}

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

        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 8,
            marginBottom: 16,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className="suivi-category-scroll"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategorieActive(cat.id)}
              style={{
                backgroundColor:
                  categorieActive === cat.id ? "#E8406A" : "white",
                color: categorieActive === cat.id ? "white" : "#8B7FA0",
                border:
                  categorieActive === cat.id ? "none" : "1.5px solid #F0E8F5",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        <style jsx global>{`
          .suivi-category-scroll::-webkit-scrollbar {
            display: none;
          }
        `}</style>

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
          ) : evenementsFiltres.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center" }}>
              Aucun événement pour cette période
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                paddingLeft: 16,
                borderLeft: "2px solid #F0E8F5",
              }}
            >
              {evenementsFiltres.map((event, index) =>
                renderTimelineRow(event, index, evenementsFiltres.length)
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

      {toastVisible && toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#4A3F5C",
            color: "white",
            padding: "12px 20px",
            borderRadius: 14,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
            maxWidth: "90%",
            textAlign: "center",
            boxShadow: "0 4px 16px rgba(74,63,92,0.2)",
          }}
        >
          {toastMessage}
        </div>
      )}
    </main>
  );
}
