'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  fetchEvents as fetchEventsFromDb,
  formatTimeShort,
  getBiberonAlert,
  getCardSubtitle,
  getEventEmoji,
  getEventLabel,
} from "@/lib/events";
import {
  type DemoBaby,
  type DemoBabySexe,
  type DemoParcours,
  fetchDemoEvents,
  computeDemoBabyMetrics,
  formatExactBabyAge,
  getAgeInDays,
  getDemoBaby,
  getDemoFeedingBanner,
  getOrCreateSessionId,
  hasDemoBaby,
  loadPoidsActuel,
  saveWeightLocalStorage,
  insertDemoEvent,
  isReturningAfter24h,
  markInvite24hShown,
  markInvite8Shown,
  saveDemoBaby,
  wasInvite24hShown,
  wasInvite8Shown,
} from "@/lib/demo";
import {
  getBiberonQuantityFeedback,
  getBiberonToast,
  formatBiberonCountdownTimer,
  getBiberonCountdown,
  resolveBiberonInputMode,
  serializeTeteeNote,
  getTeteeToast,
} from "@/lib/biberon";
import {
  countTodayEvents,
  getContextualMessage,
  getEventToastMessage,
  isToday,
  type BabyMessageContext,
} from "@/lib/dashboard-messages";
import {
  type ActiveSieste,
  type NuitNoteData,
  type NuitReveil,
  clearActiveSieste,
  combineDateAndTime,
  countTodayReveils,
  dismissNightBanner,
  formatDurationHM,
  formatChronometer,
  formatElapsedSince,
  genderEveille,
  genderIlElle,
  genderReveille,
  getNightAnalysis,
  getSiesteDurationMinutes,
  getSiesteEndToast,
  hasNightRecordedToday,
  isMorningPromptHour,
  isNightBannerDismissed,
  isNightModeHour,
  loadActiveSieste,
  loadNightBedtime,
  NUIT_REVEIL_COUNTS,
  REVEIL_CAUSES,
  REVEIL_DUREES,
  saveActiveSieste,
  saveNightBedtime,
  serializeNote,
  SIESTE_DURATION_OPTIONS,
  toTimeInputValue,
} from "@/lib/sleep";
import { BabyAvatar } from "@/components/BabyAvatar";
import { ModalSheet } from "@/components/ModalSheet";
import { AnimatePresence, motion } from "framer-motion";
import { loadAuthAvatarUrl, loadBabyAvatar } from "@/lib/avatar";
import type { BebebouEvent, EventType } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

const pleureSuggestions = [
  "Il a peut-être faim 🍼",
  "Couche à changer ? 🌿",
  "Il est fatigué 🌙",
  "Besoin de câlins 🤗",
];

type ModalType =
  | "biberon"
  | "couche"
  | "pleure"
  | "sieste_start"
  | "sieste_end"
  | "nuit"
  | null;

type AddEventOptions = {
  createdAt?: string;
  customToast?: string;
};

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getBabyAge(birthdate: string): string {
  const birth = new Date(birthdate);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());

  if (months < 1) return "nouveau-né";
  if (months < 24) return `${months} mois`;
  const years = Math.floor(months / 12);
  return `${years} an${years > 1 ? "s" : ""}`;
}

function getBiberonRecommandation(ageEnJours: number) {
  if (ageEnJours <= 14) return { ml: 75, intervalleMin: 150 };
  if (ageEnJours <= 30) return { ml: 105, intervalleMin: 180 };
  if (ageEnJours <= 60) return { ml: 135, intervalleMin: 180 };
  if (ageEnJours <= 90) return { ml: 165, intervalleMin: 210 };
  if (ageEnJours <= 180) return { ml: 180, intervalleMin: 210 };
  if (ageEnJours <= 270) return { ml: 225, intervalleMin: 240 };
  return { ml: 195, intervalleMin: 240 };
}

function loadBabyPoidsActuel(): string | null {
  if (typeof window === "undefined") return null;
  const poidsActuel =
    localStorage.getItem("baby_poids_actuel") ||
    localStorage.getItem("baby_poids");
  if (!poidsActuel) return null;
  const n = parseFloat(poidsActuel);
  return n > 0 ? poidsActuel : null;
}

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<BebebouEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [biberonMl, setBiberonMl] = useState("120");
  const [biberonMlEdited, setBiberonMlEdited] = useState(false);
  const [biberonInputMode, setBiberonInputMode] = useState<
    "choice" | "ml" | "tetee"
  >("ml");
  const [teteeMinutes, setTeteeMinutes] = useState("15");
  const [teteeSein, setTeteeSein] = useState<"gauche" | "droit" | null>(null);
  const [biberonTick, setBiberonTick] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [babyInfo, setBabyInfo] = useState("Louise · 3 mois");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showBabySetupModal, setShowBabySetupModal] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");
  const [demoBabyPrenom, setDemoBabyPrenom] = useState("");
  const [demoBabySexe, setDemoBabySexe] = useState<DemoBabySexe | "">("");
  const [demoBabyDateNaissance, setDemoBabyDateNaissance] = useState("");
  const [demoBabyPoidsNaissance, setDemoBabyPoidsNaissance] = useState("");
  const [demoBabyPoidsActuel, setDemoBabyPoidsActuel] = useState("");
  const [demoBabyParcours, setDemoBabyParcours] = useState<DemoParcours | "">("");
  const [demoBaby, setDemoBaby] = useState<DemoBaby | null>(null);
  const [demoBabyName, setDemoBabyName] = useState("");
  const [lastRecordedEventType, setLastRecordedEventType] =
    useState<EventType | null>(null);
  const [pendingCardType, setPendingCardType] = useState<EventType | null>(null);
  const [pendingShare, setPendingShare] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const [alertTick, setAlertTick] = useState(0);
  const [babySetupError, setBabySetupError] = useState<string | null>(null);
  const [babyContext, setBabyContext] = useState<BabyMessageContext | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userScopeId, setUserScopeId] = useState("");
  const [activeSieste, setActiveSieste] = useState<ActiveSieste | null>(null);
  const [chronoTick, setChronoTick] = useState(0);
  const [nightUiTick, setNightUiTick] = useState(0);
  const [siesteStartTime, setSiesteStartTime] = useState(toTimeInputValue());
  const [siesteEstimatedMin, setSiesteEstimatedMin] = useState<number | null>(
    null
  );
  const [siesteEndTime, setSiesteEndTime] = useState(toTimeInputValue());
  const [nuitCoucher, setNuitCoucher] = useState("21:00");
  const [nuitLever, setNuitLever] = useState("07:00");
  const [nuitReveilCount, setNuitReveilCount] = useState(0);
  const [nuitReveils, setNuitReveils] = useState<NuitReveil[]>([]);

  function applyDemoBabyToUI(baby: DemoBaby) {
    const metrics = computeDemoBabyMetrics(baby);
    setDemoBaby(baby);
    setDemoBabyName(baby.prenom);
    setBabyInfo(`${baby.prenom} · ${metrics.ageLabel}`);
    setBabyContext({
      prenom: baby.prenom,
      sexe: baby.sexe,
      date_naissance: baby.date_naissance,
      poids_naissance: baby.poids_naissance,
      poids_actuel: baby.poids_actuel,
      parcours: baby.parcours,
    });
  }

  function getFeedingProfile() {
    if (babyContext?.date_naissance && babyContext.poids_actuel) {
      return babyContext;
    }
    const baby = demoBaby ?? getDemoBaby(demoSessionId);
    if (!baby) return null;
    return {
      prenom: baby.prenom,
      sexe: baby.sexe,
      date_naissance: baby.date_naissance,
      poids_naissance: baby.poids_naissance,
      poids_actuel: baby.poids_actuel,
      parcours: baby.parcours,
    };
  }

  function openBiberonModal() {
    const profile = getFeedingProfile();
    const recommended = profile?.date_naissance
      ? getBiberonRecommandation(getAgeInDays(profile.date_naissance)).ml
      : 120;
    setBiberonMl(String(recommended));
    setBiberonMlEdited(false);
    setTeteeMinutes("15");
    setTeteeSein(null);
    setBiberonInputMode(resolveBiberonInputMode(profile?.parcours));
    setError(null);
    setActiveModal("biberon");
  }

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastKey((k) => k + 1);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }

  function validateBabySetup(): string | null {
    if (!demoBabyPrenom.trim()) return "Le prénom du bébé est obligatoire.";
    if (!demoBabySexe) return "Le sexe est obligatoire.";
    if (!demoBabyDateNaissance) return "La date de naissance est obligatoire.";
    const poidsNaissance = parseFloat(demoBabyPoidsNaissance.replace(",", "."));
    const poidsActuel = parseFloat(demoBabyPoidsActuel.replace(",", "."));
    if (!demoBabyPoidsNaissance || !poidsNaissance || poidsNaissance <= 0) {
      return "Le poids de naissance est obligatoire (ex: 3.2).";
    }
    if (!demoBabyPoidsActuel || !poidsActuel || poidsActuel <= 0) {
      return "Le poids actuel est obligatoire (ex: 4.5).";
    }
    if (!demoBabyParcours) return "Le parcours d'alimentation est obligatoire.";
    return null;
  }

  useEffect(() => {
    async function checkAuth() {
      const supabaseClient = createSupabaseClient();
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (!user) {
        setIsAuthenticated(false);

        const sessionId = getOrCreateSessionId();
        setDemoSessionId(sessionId);

        const storedBaby = getDemoBaby(sessionId);
        if (storedBaby) {
          applyDemoBabyToUI(storedBaby);
        } else {
          setDemoBaby(null);
          setBabyInfo("votre bébé");
        }

        try {
          const demoEvents = await fetchDemoEvents(sessionId);
          setEvents(demoEvents);

          if (
            storedBaby &&
            isReturningAfter24h(demoEvents) &&
            !wasInvite24hShown(sessionId)
          ) {
            markInvite24hShown(sessionId);
            setShowSignupModal(true);
          }

          setDemoReady(true);
        } catch (error) {
          console.error("Demo error:", error);
          // Ne pas afficher d'erreur à l'utilisateur, continuer quand même
          setDemoReady(true);
        }

        setAuthChecked(true);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      setUserEmail(user.email ?? null);
      setUserScopeId(user.id);

      const { data: baby } = await supabase
        .from("babies")
        .select(
          "prenom, date_naissance, name, birthdate, sexe, poids_naissance, parcours"
        )
        .limit(1)
        .single();

      if (baby) {
        const prenom = baby.prenom ?? baby.name;
        const birthdate = baby.date_naissance ?? baby.birthdate;
        if (prenom && birthdate) {
          setBabyInfo(`${prenom} · ${getBabyAge(birthdate)}`);
          setBabyContext({
            prenom,
            sexe: baby.sexe ?? null,
            date_naissance: birthdate,
            poids_naissance: baby.poids_naissance ?? null,
            poids_actuel:
              loadPoidsActuel() ?? baby.poids_naissance ?? null,
            parcours: (baby.parcours as DemoParcours) ?? null,
          });
        }
      }

      setAuthChecked(true);
    }

    checkAuth();
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const supabaseClient = createSupabaseClient();
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) return;

      const data = await fetchEventsFromDb(user.id);
      setEvents(data);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les événements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents();
    }
  }, [fetchEvents, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && demoBaby) {
      const interval = setInterval(() => setAlertTick((t) => t + 1), 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, demoBaby]);

  const scopeId = isAuthenticated ? userScopeId : demoSessionId;

  useEffect(() => {
    function syncAvatarFromStorage() {
      const saved = loadBabyAvatar();
      if (saved) {
        setAvatarUrl(saved);
        return true;
      }
      return false;
    }

    async function loadAvatar() {
      if (syncAvatarFromStorage()) return;

      if (isAuthenticated && userScopeId) {
        const url = await loadAuthAvatarUrl(userScopeId);
        if (url) setAvatarUrl(url);
      }
    }

    loadAvatar();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "baby_avatar" || e.key === null) {
        syncAvatarFromStorage();
      }
    };
    const onFocus = () => syncAvatarFromStorage();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated, userScopeId, demoSessionId]);

  useEffect(() => {
    if (!scopeId) return;
    setActiveSieste(loadActiveSieste(scopeId));
  }, [scopeId]);

  useEffect(() => {
    if (!activeSieste) return;
    const interval = setInterval(() => setChronoTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeSieste]);

  useEffect(() => {
    const interval = setInterval(() => setNightUiTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const lastBiberon = events.find((e) => e.type === "biberon") ?? null;

  useEffect(() => {
    if (!lastBiberon) return;
    const interval = setInterval(() => setBiberonTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [lastBiberon?.id, lastBiberon?.created_at]);

  function checkDemoInviteAfterEvent(
    updatedEvents: BebebouEvent[],
    sessionId: string
  ) {
    if (updatedEvents.length >= 8 && !wasInvite8Shown(sessionId)) {
      markInvite8Shown(sessionId);
      setShowSignupModal(true);
    }
  }

  async function addDemoEvent(
    type: EventType,
    note?: string,
    quantity?: number,
    options?: AddEventOptions
  ) {
    const sessionId = demoSessionId || getOrCreateSessionId();
    setDemoSessionId(sessionId);
    setSaving(true);
    setError(null);

    try {
      await insertDemoEvent(
        sessionId,
        type,
        note,
        quantity,
        options?.createdAt
      );
      const updated = await fetchDemoEvents(sessionId);
      setEvents(updated);
      setLastRecordedEventType(type);
      setActiveModal(null);
      checkDemoInviteAfterEvent(updated, sessionId);
      const ctx =
        babyContext ??
        (demoBaby
          ? {
              prenom: demoBaby.prenom,
              sexe: demoBaby.sexe,
              date_naissance: demoBaby.date_naissance,
              poids_naissance: demoBaby.poids_naissance,
              poids_actuel: demoBaby.poids_actuel,
            }
          : null);
      if (ctx) {
        showToast(
          options?.customToast ??
            getEventToastMessage(type, ctx, note, quantity)
        );
      }
    } catch (err) {
      console.error(err);
      setError("Impossible d'enregistrer l'événement");
    } finally {
      setSaving(false);
    }
  }

  async function addEvent(
    type: string,
    note?: string,
    quantity?: number,
    options?: AddEventOptions
  ) {
    const eventType = type as EventType;

    if (!isAuthenticated) {
      await addDemoEvent(eventType, note, quantity, options);
      return;
    }

    setSaving(true);
    setError(null);

    const supabaseClient = createSupabaseClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const row: Record<string, unknown> = {
      type,
      note: note ?? null,
      quantity: quantity ?? null,
      user_id: user.id,
    };
    if (options?.createdAt) row.created_at = options.createdAt;

    const { error: insertError } = await supabase.from("events").insert(row);

    if (insertError) {
      console.error(insertError);
      setError("Impossible d'enregistrer l'événement");
    } else {
      await fetchEvents();
      setLastRecordedEventType(eventType);
      setActiveModal(null);
      if (babyContext) {
        showToast(
          options?.customToast ??
            getEventToastMessage(eventType, babyContext, note, quantity)
        );
      }
    }

    setSaving(false);
  }

  function handleShareClick() {
    const sessionId = demoSessionId || getOrCreateSessionId();
    if (!hasDemoBaby(sessionId)) {
      setPendingShare(true);
      setBabySetupError(null);
      setShowBabySetupModal(true);
      return;
    }
    setShowSignupModal(true);
  }

  function openSiesteStartModal() {
    setSiesteStartTime(toTimeInputValue());
    setSiesteEstimatedMin(null);
    setActiveModal("sieste_start");
  }

  function openSiesteEndModal() {
    setSiesteEndTime(toTimeInputValue());
    setActiveModal("sieste_end");
  }

  function openNuitModal() {
    const bedtime = loadNightBedtime();
    setNuitCoucher(bedtime ?? "21:00");
    setNuitLever(toTimeInputValue());
    setNuitReveilCount(0);
    setNuitReveils([]);
    setActiveModal("nuit");
  }

  function handleReveilCountChange(count: number) {
    setNuitReveilCount(count);
    const forms = count === 4 ? 4 : count;
    setNuitReveils((prev) => {
      const next = [...prev];
      while (next.length < forms) {
        next.push({ heure: "02:00", cause: "inconnu", duree: "10-30min" });
      }
      return next.slice(0, forms);
    });
  }

  function handleSiesteStart() {
    if (!scopeId) return;
    const startDate = combineDateAndTime(new Date(), siesteStartTime);
    const sieste: ActiveSieste = {
      scopeId,
      start: startDate.toISOString(),
      estimatedMinutes: siesteEstimatedMin ?? undefined,
    };
    saveActiveSieste(sieste);
    setActiveSieste(sieste);
    setActiveModal(null);
    showToast("🌙 Sieste démarrée — bon repos !");
  }

  function handleSiesteEnd() {
    if (!activeSieste) return;
    const ctx =
      babyContext ??
      (demoBaby
        ? {
            prenom: demoBaby.prenom,
            sexe: demoBaby.sexe,
            date_naissance: demoBaby.date_naissance,
            poids_naissance: demoBaby.poids_naissance,
            poids_actuel: demoBaby.poids_actuel,
          }
        : null);
    if (!ctx) return;

    const durationMin = getSiesteDurationMinutes(
      activeSieste.start,
      siesteEndTime
    );
    const endDate = combineDateAndTime(new Date(), siesteEndTime);
    const note = serializeNote({
      start: activeSieste.start,
      end: endDate.toISOString(),
      durationMin,
    });
    const toast = getSiesteEndToast(
      ctx.prenom,
      durationMin,
      ctx.date_naissance
    );
    clearActiveSieste();
    setActiveSieste(null);
    setActiveModal(null);
    addEvent("sieste", note, undefined, {
      createdAt: endDate.toISOString(),
      customToast: toast,
    });
  }

  function handleNuitSubmit() {
    if (!babyContext) return;
    const data: NuitNoteData = {
      coucher: nuitCoucher,
      lever: nuitLever,
      reveils: nuitReveils.slice(0, nuitReveilCount === 4 ? 4 : nuitReveilCount),
      totalReveils: nuitReveilCount,
    };
    const leverDate = combineDateAndTime(new Date(), nuitLever);
    const analysis = getNightAnalysis(
      babyContext.prenom,
      babyContext.date_naissance,
      data
    );
    setActiveModal(null);
    addEvent("nuit", serializeNote(data), undefined, {
      createdAt: leverDate.toISOString(),
      customToast: analysis,
    });
  }

  function handleNightBedYes() {
    const now = toTimeInputValue();
    saveNightBedtime(now);
    setNuitCoucher(now);
    dismissNightBanner();
    setNightUiTick((t) => t + 1);
    showToast(`🌙 Bonne nuit ! Coucher enregistré à ${now.replace(":", "h")}`);
  }

  function handleNightStillAwake() {
    dismissNightBanner();
    setNightUiTick((t) => t + 1);
  }

  function proceedWithCard(type: EventType) {
    switch (type) {
      case "biberon":
        openBiberonModal();
        break;
      case "couche":
        setActiveModal("couche");
        break;
      case "sieste":
        if (activeSieste) openSiesteEndModal();
        else openSiesteStartModal();
        break;
      case "nuit":
        openNuitModal();
        break;
      case "pleure":
        setActiveModal("pleure");
        break;
    }
  }

  function handleCardClick(type: EventType) {
    if (saving) return;

    const sessionId = demoSessionId || getOrCreateSessionId();
    if (!isAuthenticated && !hasDemoBaby(sessionId)) {
      setPendingCardType(type);
      setBabySetupError(null);
      setShowBabySetupModal(true);
      return;
    }

    proceedWithCard(type);
  }

  function handleBabySetupSubmit() {
    const validationError = validateBabySetup();
    if (validationError) {
      setBabySetupError(validationError);
      return;
    }

    const poidsNaissance = parseFloat(demoBabyPoidsNaissance.replace(",", "."));
    const poidsActuel = parseFloat(demoBabyPoidsActuel.replace(",", "."));
    const sessionId = demoSessionId || getOrCreateSessionId();
    setDemoSessionId(sessionId);

    const baby: DemoBaby = {
      session_id: sessionId,
      prenom: demoBabyPrenom.trim(),
      sexe: demoBabySexe as DemoBabySexe,
      date_naissance: demoBabyDateNaissance,
      poids_naissance: poidsNaissance,
      poids_actuel: poidsActuel,
      parcours: demoBabyParcours as DemoParcours,
    };

    computeDemoBabyMetrics(baby);
    saveDemoBaby(baby);
    saveWeightLocalStorage(poidsNaissance, poidsActuel);
    applyDemoBabyToUI(baby);
    setShowBabySetupModal(false);
    setBabySetupError(null);
    setError(null);

    if (pendingShare) {
      setPendingShare(false);
      setShowSignupModal(true);
      return;
    }

    if (pendingCardType) {
      const type = pendingCardType;
      setPendingCardType(null);
      proceedWithCard(type);
    }
  }

  function handleBiberonSubmit() {
    const profile = getFeedingProfile();

    if (biberonInputMode === "tetee") {
      const minutes = parseInt(teteeMinutes, 10);
      if (!minutes || minutes <= 0) {
        setError("Veuillez saisir une durée valide en minutes");
        return;
      }
      if (!teteeSein) {
        setError("Sélectionnez un sein");
        return;
      }
      const toast = getTeteeToast(
        minutes,
        teteeSein,
        profile?.date_naissance
      );
      addEvent("biberon", serializeTeteeNote(teteeSein, minutes), minutes, {
        customToast: toast,
      });
      return;
    }

    const quantity = parseInt(biberonMl, 10);
    if (!quantity || quantity <= 0) {
      setError("Veuillez saisir une quantité valide en ml");
      return;
    }
    const toast = getBiberonToast(quantity, profile?.date_naissance);
    addEvent("biberon", undefined, quantity, { customToast: toast });
  }

  function closeModal() {
    if (!saving) setActiveModal(null);
  }

  async function handleSignOut() {
    const supabaseClient = createSupabaseClient();
    await supabaseClient.auth.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    setActiveModal(null);
    setShowSignupModal(false);
    setShowBabySetupModal(false);

    const sessionId = getOrCreateSessionId();
    const storedBaby = getDemoBaby(sessionId);
    if (storedBaby) {
      applyDemoBabyToUI(storedBaby);
    } else {
      setDemoBaby(null);
      setDemoBabyName("");
      setBabyInfo("votre bébé");
    }

    try {
      setDemoSessionId(sessionId);
      const demoEvents = await fetchDemoEvents(sessionId);
      setEvents(demoEvents);
    } catch (err) {
      console.error(err);
      setEvents([]);
    }

    setLastRecordedEventType(null);
    setLoading(false);
    router.push("/");
  }

  const demoBanner = useMemo(() => {
    if (isAuthenticated || !demoBaby) return null;
    void alertTick;
    return getDemoFeedingBanner(demoBaby, events, lastRecordedEventType);
  }, [isAuthenticated, demoBaby, events, lastRecordedEventType, alertTick]);

  const contextualMessage = useMemo(() => {
    if (!babyContext) return null;
    return getContextualMessage(babyContext, events);
  }, [babyContext, events]);

  const dailyScore = useMemo(
    () => ({
      biberon: countTodayEvents(events, "biberon"),
      couche: countTodayEvents(events, "couche"),
      sieste: countTodayEvents(events, "sieste"),
      pleure: countTodayEvents(events, "pleure"),
      reveils: countTodayReveils(events),
    }),
    [events]
  );

  const todayEvents = useMemo(
    () => events.filter((e) => isToday(e.created_at)),
    [events]
  );

  const showNightMode = useMemo(() => {
    void nightUiTick;
    return (
      isNightModeHour() &&
      !isNightBannerDismissed() &&
      Boolean(babyContext?.prenom)
    );
  }, [nightUiTick, babyContext]);

  const showMorningPrompt = useMemo(() => {
    void nightUiTick;
    return (
      isMorningPromptHour() &&
      !hasNightRecordedToday(events) &&
      Boolean(babyContext?.prenom)
    );
  }, [nightUiTick, events, babyContext]);

  const siesteElapsed = useMemo(() => {
    void chronoTick;
    if (!activeSieste) return null;
    return formatElapsedSince(activeSieste.start);
  }, [activeSieste, chronoTick]);

  const siesteChronometer = useMemo(() => {
    void chronoTick;
    if (!activeSieste) return null;
    return formatChronometer(activeSieste.start);
  }, [activeSieste, chronoTick]);

  const siesteEndDurationMin = activeSieste
    ? getSiesteDurationMinutes(activeSieste.start, siesteEndTime)
    : 0;

  const feedingProfile = getFeedingProfile();
  const recommendedMl = feedingProfile?.date_naissance
    ? getBiberonRecommandation(getAgeInDays(feedingProfile.date_naissance)).ml
    : 120;

  const biberonMlValue = Math.min(
    350,
    Math.max(10, parseInt(biberonMl, 10) || recommendedMl)
  );

  function adjustBiberonMl(delta: number) {
    setBiberonMlEdited(true);
    setBiberonMl(String(Math.min(350, Math.max(10, biberonMlValue + delta))));
  }

  const biberonFeedback = useMemo(() => {
    if (biberonInputMode !== "ml" || !biberonMlEdited) return null;
    const qty = parseInt(biberonMl, 10);
    if (!feedingProfile?.prenom) return null;
    return getBiberonQuantityFeedback(qty, recommendedMl, feedingProfile.prenom);
  }, [
    biberonInputMode,
    biberonMl,
    biberonMlEdited,
    recommendedMl,
    feedingProfile?.prenom,
  ]);

  const biberonCountdown = useMemo(() => {
    void biberonTick;
    return getBiberonCountdown(
      lastBiberon?.created_at ?? null,
      feedingProfile?.date_naissance
    );
  }, [biberonTick, lastBiberon, feedingProfile?.date_naissance]);

  const biberonCountdownTimer = useMemo(() => {
    void biberonTick;
    return formatBiberonCountdownTimer(
      lastBiberon?.created_at ?? null,
      feedingProfile?.date_naissance
    );
  }, [biberonTick, lastBiberon, feedingProfile?.date_naissance]);

  if (!authChecked) {
    return (
      <main
        style={{
          backgroundColor: "#FDF8F2",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontSize: 14, color: "#8B7FA0" }}>Chargement...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>
      {/* Logo + avatar */}
      <header className="relative flex justify-center px-4 pb-2 pt-8">
        {isAuthenticated && userEmail && (
          <div
            className="absolute left-4 top-8 flex items-center gap-2"
            style={{ maxWidth: "calc(50% - 40px)" }}
          >
            <span
              style={{
                fontSize: 13,
                color: "#8B7FA0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                backgroundColor: "white",
                border: "1.5px solid #F0E8F8",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                color: "#8B7FA0",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Se déconnecter
            </button>
          </div>
        )}
        <div
          className="absolute right-4 top-8"
          style={{ zIndex: 2 }}
        >
          <BabyAvatar
            prenom={babyContext?.prenom ?? demoBabyName ?? "?"}
            photoUrl={avatarUrl}
            size={48}
          />
        </div>
        <img
          src="/logo-horizontal.png"
          alt="Mon Bebebou"
          className="mx-auto h-auto w-full"
          style={{ maxWidth: 320 }}
        />
      </header>

      <div
        style={{
          maxWidth: 448,
          margin: "0 auto 12px",
          padding: "0 16px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundColor: "white",
            borderRadius: 16,
            padding: "10px 16px",
            fontSize: 13,
            color: "#8B7FA0",
            textAlign: "center",
            boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
          }}
        >
          🍼 {dailyScore.biberon} biberons · 🌿 {dailyScore.couche} couches · 🌙{" "}
          {dailyScore.sieste} siestes · 😢 {dailyScore.pleure} pleurs · 🌙{" "}
          {dailyScore.reveils} réveils
        </motion.div>
      </div>

      {showMorningPrompt && babyContext && (
        <div
          style={{
            maxWidth: 448,
            margin: "0 auto 12px",
            padding: "0 16px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 14, color: "#4A3F5C", margin: "0 0 12px" }}>
              ☀️ Bonjour ! Comment s&apos;est passée la nuit de{" "}
              {babyContext.prenom} ?
            </p>
            <button
              type="button"
              onClick={openNuitModal}
              style={{
                backgroundColor: "#E8406A",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Renseigner la nuit
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-md space-y-4 px-4 pb-10">
        {error && (
          <p className="rounded-2xl bg-red-100 px-4 py-3 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Statut / Mode nuit */}
        <motion.section
          animate={{
            backgroundColor:
              showNightMode && babyContext ? "#1a1a2e" : "#D4EDE1",
          }}
          transition={{ duration: 0.4 }}
          style={{
            borderRadius: 24,
            padding: showNightMode && babyContext ? "16px 20px" : "16px 20px",
            textAlign: "center",
            boxShadow:
              showNightMode && babyContext
                ? "0 4px 16px rgba(26,26,46,0.2)"
                : "0 4px 16px rgba(74,63,92,0.06)",
          }}
        >
          {showNightMode && babyContext ? (
            <>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "white",
                  margin: "0 0 12px",
                }}
              >
                🌙 Mode nuit · {babyContext.prenom} dort-
                {genderIlElle(babyContext.sexe)} ?
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={handleNightBedYes}
                  style={{
                    flex: 1,
                    backgroundColor: "#E8406A",
                    color: "white",
                    border: "none",
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Oui, au lit
                </button>
                <button
                  type="button"
                  onClick={handleNightStillAwake}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(255,255,255,0.15)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Non, encore {genderEveille(babyContext.sexe)}
                </button>
              </div>
            </>
          ) : (
            <p
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#4A3F5C",
                margin: 0,
              }}
            >
              Tout va bien ✅ · {babyInfo}
            </p>
          )}
        </motion.section>

        <AnimatePresence>
          {contextualMessage && (
            <motion.section
              key={contextualMessage.text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{
                backgroundColor: "white",
                borderRadius: 16,
                padding: 16,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>
                {contextualMessage.emoji}
              </span>
              <p
                style={{
                  fontSize: 14,
                  color: "#4A3F5C",
                  margin: 0,
                  lineHeight: 1.5,
                  flex: 1,
                }}
              >
                {contextualMessage.text}
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Alerte */}
        <motion.section
          animate={{
            backgroundColor: demoBanner?.backgroundColor ?? "#FFF3CD",
          }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl px-4 py-3 shadow-md"
        >
          <p className="text-sm leading-relaxed text-[#4A3F5C]">
            {loading
              ? "⏰ Chargement..."
              : demoBanner
                ? `⏰ ${demoBanner.message}`
                : `⏰ ${getBiberonAlert(events)}`}
          </p>
        </motion.section>

        {/* Grille 2x2 — classes Tailwind en dur (pas de variables dynamiques) */}
        <section className="grid grid-cols-2 gap-4">
          <motion.button
            type="button"
            onClick={() => handleCardClick("biberon")}
            disabled={saving}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="rounded-3xl p-5 text-center shadow-md disabled:opacity-60"
            style={{ backgroundColor: "#FEF3E2" }}
          >
            <p className="text-4xl">🍼</p>
            <p className="mt-2 font-bold text-[#4A3F5C]">Biberon</p>
            {lastBiberon && biberonCountdownTimer ? (
              <>
                <p
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: biberonCountdown?.overdue ? "#E8406A" : "#8B7FA0",
                    fontWeight: 600,
                  }}
                >
                  {biberonCountdown?.label}
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 20,
                    fontWeight: 700,
                    color: biberonCountdown?.overdue ? "#E8406A" : "#4A3F5C",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {biberonCountdownTimer}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-[#8B7FA0]">
                {saving
                  ? "Enregistrement..."
                  : getCardSubtitle("biberon", events)}
              </p>
            )}
          </motion.button>

          <motion.button
            type="button"
            onClick={() => handleCardClick("couche")}
            disabled={saving}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="rounded-3xl p-5 text-center shadow-md disabled:opacity-60"
            style={{ backgroundColor: "#E8F8EE" }}
          >
            <p className="text-4xl">🌿</p>
            <p className="mt-2 font-bold text-[#4A3F5C]">Couche</p>
            <p className="mt-1 text-xs text-[#8B7FA0]">
              {saving ? "Enregistrement..." : getCardSubtitle("couche", events)}
            </p>
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl p-5 text-center shadow-md"
            style={{ backgroundColor: "#EAE4F7" }}
          >
            {activeSieste ? (
              <>
                <motion.p
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  style={{ fontSize: 36, margin: 0 }}
                >
                  🌙
                </motion.p>
                <p
                  style={{
                    marginTop: 8,
                    fontWeight: 700,
                    color: "#4A3F5C",
                    fontSize: 15,
                  }}
                >
                  Sieste en cours depuis {siesteElapsed}
                </p>
                <motion.p
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  style={{
                    marginTop: 6,
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#4A3F5C",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {siesteChronometer}
                </motion.p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSiesteEndModal();
                  }}
                  disabled={saving}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    backgroundColor: "#E8406A",
                    color: "white",
                    border: "none",
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {genderReveille(babyContext?.sexe ?? null)}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleCardClick("sieste")}
                disabled={saving}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <p style={{ fontSize: 36, margin: 0 }}>🌙</p>
                <p
                  style={{
                    marginTop: 8,
                    fontWeight: 700,
                    color: "#4A3F5C",
                  }}
                >
                  Sieste
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#8B7FA0",
                  }}
                >
                  {saving
                    ? "Enregistrement..."
                    : getCardSubtitle("sieste", events)}
                </p>
              </button>
            )}
          </motion.div>

          <motion.button
            type="button"
            onClick={() => handleCardClick("pleure")}
            disabled={saving}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="rounded-3xl p-5 text-center shadow-md disabled:opacity-60"
            style={{ backgroundColor: "#FFE4E4" }}
          >
            <p className="text-4xl">😢</p>
            <p className="mt-2 font-bold text-[#4A3F5C]">Bébé pleure</p>
            <p className="mt-1 text-xs text-[#8B7FA0]">
              {saving ? "Enregistrement..." : getCardSubtitle("pleure", events)}
            </p>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => handleCardClick("nuit")}
            disabled={saving}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="col-span-2 rounded-3xl p-5 text-center shadow-md disabled:opacity-60"
            style={{ backgroundColor: "#E8EAF6" }}
          >
            <p className="text-4xl">🌙</p>
            <p className="mt-2 font-bold text-[#4A3F5C]">Nuit</p>
            <p className="mt-1 text-xs text-[#8B7FA0]">
              {saving ? "Enregistrement..." : getCardSubtitle("nuit", events)}
            </p>
          </motion.button>
        </section>

        {!isAuthenticated && (
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={handleShareClick}
              style={{
                background: "none",
                border: "none",
                color: "#8B7FA0",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                padding: "4px 8px",
              }}
            >
              Partager
            </button>
          </div>
        )}

        {/* Timeline */}
        <section className="rounded-3xl bg-white px-5 py-5 shadow-md">
          <h2 className="mb-4 text-base font-bold text-[#4A3F5C]">
            Aujourd&apos;hui
          </h2>

          {loading ? (
            <p className="text-sm text-[#8B7FA0]">Chargement...</p>
          ) : todayEvents.length === 0 ? (
            <p className="text-sm text-[#8B7FA0]">
              Aucun événement — cliquez sur une carte pour commencer
            </p>
          ) : (
            <ul className="space-y-3">
              {todayEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-xs font-medium text-[#8B7FA0]">
                    {formatTimeShort(new Date(event.created_at))}
                  </span>
                  <span className="text-lg">{getEventEmoji(event.type)}</span>
                  <span className="text-sm text-[#4A3F5C]">
                    {getEventLabel(event)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <button
            type="button"
            onClick={() => router.push("/profil")}
            style={{
              background: "none",
              border: "none",
              color: "#8B7FA0",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              padding: "4px 8px",
            }}
          >
            👶 Profil
          </button>
        </div>
      </div>

      <ModalSheet
        open={activeModal === "biberon"}
        onClose={closeModal}
        centered
      >
            <h3 className="text-lg font-bold text-[#4A3F5C]">🍼 Biberon</h3>

            {biberonInputMode === "choice" && (
              <>
                <p style={{ marginTop: 8, fontSize: 14, color: "#8B7FA0" }}>
                  Que souhaitez-vous enregistrer ?
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => setBiberonInputMode("ml")}
                    style={{
                      flex: 1,
                      backgroundColor: "#FEF3E2",
                      border: "2px solid #E8E0F0",
                      borderRadius: 14,
                      padding: "16px 12px",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#4A3F5C",
                      cursor: "pointer",
                    }}
                  >
                    🍼 Biberon
                  </button>
                  <button
                    type="button"
                    onClick={() => setBiberonInputMode("tetee")}
                    style={{
                      flex: 1,
                      backgroundColor: "#FFF0F4",
                      border: "2px solid #E8E0F0",
                      borderRadius: 14,
                      padding: "16px 12px",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#4A3F5C",
                      cursor: "pointer",
                    }}
                  >
                    🤱 Tétée
                  </button>
                </div>
              </>
            )}

            {biberonInputMode === "ml" && (
              <>
                <p style={{ marginTop: 8, fontSize: 14, color: "#8B7FA0" }}>
                  Combien de ml ?
                </p>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => adjustBiberonMl(-10)}
                    disabled={biberonMlValue <= 10}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      border: "1.5px solid #F0E8F8",
                      backgroundColor: "#FDF8F2",
                      fontSize: 24,
                      fontWeight: 600,
                      color: "#4A3F5C",
                      cursor: biberonMlValue <= 10 ? "not-allowed" : "pointer",
                      opacity: biberonMlValue <= 10 ? 0.4 : 1,
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
                    {biberonMlValue} ml
                  </div>
                  <button
                    type="button"
                    onClick={() => adjustBiberonMl(10)}
                    disabled={biberonMlValue >= 350}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      border: "1.5px solid #F0E8F8",
                      backgroundColor: "#FDF8F2",
                      fontSize: 24,
                      fontWeight: 600,
                      color: "#4A3F5C",
                      cursor: biberonMlValue >= 350 ? "not-allowed" : "pointer",
                      opacity: biberonMlValue >= 350 ? 0.4 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
                {feedingProfile?.prenom && feedingProfile.date_naissance && (
                    <p
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: "#8B7FA0",
                        textAlign: "center",
                      }}
                    >
                      {(() => {
                        const age = formatExactBabyAge(
                          feedingProfile.date_naissance
                        );
                        const base = `Recommandé pour ${feedingProfile.prenom} à ${age}`;
                        const poidsActuel = loadBabyPoidsActuel();
                        return poidsActuel
                          ? `${base} · ${poidsActuel}kg`
                          : base;
                      })()}
                    </p>
                  )}
                {biberonFeedback && (
                  <p
                    style={{
                      marginTop: 12,
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#4A3F5C",
                      textAlign: "center",
                      backgroundColor: biberonFeedback.backgroundColor,
                    }}
                  >
                    {biberonFeedback.message}
                  </p>
                )}
              </>
            )}

            {biberonInputMode === "tetee" && (
              <>
                <p style={{ marginTop: 8, fontSize: 14, color: "#8B7FA0" }}>
                  Durée de la tétée (minutes)
                </p>
                <input
                  type="number"
                  value={teteeMinutes}
                  onChange={(e) => setTeteeMinutes(e.target.value)}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    borderRadius: 14,
                    border: "1px solid #E8E0F0",
                    padding: "14px 16px",
                    textAlign: "center",
                    fontSize: 20,
                    color: "#4A3F5C",
                    outline: "none",
                  }}
                  placeholder="15"
                  min="1"
                  autoFocus
                />
                {feedingProfile?.prenom && feedingProfile.date_naissance && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#8B7FA0",
                      textAlign: "center",
                    }}
                  >
                    Tétée pour {feedingProfile.prenom} à{" "}
                    {formatExactBabyAge(feedingProfile.date_naissance)}
                  </p>
                )}
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    color: "#8B7FA0",
                  }}
                >
                  Sein
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  {(
                    [
                      ["gauche", "👈 Gauche"],
                      ["droit", "Droit 👉"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTeteeSein(id)}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        padding: "12px 10px",
                        fontSize: 14,
                        fontWeight: 600,
                        border:
                          teteeSein === id
                            ? "2px solid #E8406A"
                            : "1px solid #E8E0F0",
                        backgroundColor:
                          teteeSein === id ? "#FFF0F4" : "white",
                        color: "#4A3F5C",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {biberonInputMode !== "choice" && (
              <div className="mt-4 flex gap-3">
                {feedingProfile?.parcours === "mixte" && (
                  <button
                    type="button"
                    onClick={() => setBiberonInputMode("choice")}
                    disabled={saving}
                    style={{
                      flex: "0 0 auto",
                      borderRadius: 14,
                      backgroundColor: "#F5F5F5",
                      padding: "12px 14px",
                      fontSize: 13,
                      color: "#8B7FA0",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-gray-100 py-3 text-sm font-medium text-[#4A3F5C]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleBiberonSubmit}
                  disabled={saving}
                  className="flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#E8406A" }}
                >
                  Enregistrer ✅
                </button>
              </div>
            )}

            {biberonInputMode === "choice" && (
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
              >
                Annuler
              </button>
            )}
      </ModalSheet>

      <ModalSheet open={activeModal === "couche"} onClose={closeModal}>
            <h3 className="text-lg font-bold text-[#4A3F5C]">🌿 Couche</h3>
            <p className="mt-1 text-sm text-[#8B7FA0]">Pipi ou Caca ?</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => addEvent("couche", "pipi")}
                disabled={saving}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: "#E8406A" }}
              >
                💧 Pipi
              </button>
              <button
                type="button"
                onClick={() => addEvent("couche", "caca")}
                disabled={saving}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: "#E8406A" }}
              >
                💩 Caca
              </button>
            </div>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
            >
              Annuler
            </button>
      </ModalSheet>

      {/* Popup initialisation bébé démo */}
      {showBabySetupModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            padding: "20px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              margin: "auto",
              backgroundColor: "white",
              borderRadius: 24,
              padding: "28px 24px",
              boxShadow: "0 8px 32px rgba(74,63,92,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#4A3F5C",
                margin: 0,
                textAlign: "center",
              }}
            >
              C&apos;est pour qui ? 🍼
            </h3>

            {babySetupError && (
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 13,
                  color: "#C03060",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                {babySetupError}
              </p>
            )}

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 16,
                marginBottom: 6,
              }}
            >
              Prénom du bébé
            </label>
            <input
              type="text"
              value={demoBabyPrenom}
              onChange={(e) => {
                setDemoBabyPrenom(e.target.value);
                setBabySetupError(null);
              }}
              placeholder="Prénom de votre bébé"
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F8",
                fontSize: 15,
                backgroundColor: "#FDF8F2",
                color: "#4A3F5C",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              Sexe
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setDemoBabySexe("fille");
                  setBabySetupError(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    demoBabySexe === "fille"
                      ? "1.5px solid #E8406A"
                      : "1.5px solid #F0E8F8",
                  backgroundColor:
                    demoBabySexe === "fille" ? "#E8406A" : "white",
                  color: demoBabySexe === "fille" ? "white" : "#4A3F5C",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                👧 Fille
              </button>
              <button
                type="button"
                onClick={() => {
                  setDemoBabySexe("garcon");
                  setBabySetupError(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border:
                    demoBabySexe === "garcon"
                      ? "1.5px solid #E8406A"
                      : "1.5px solid #F0E8F8",
                  backgroundColor:
                    demoBabySexe === "garcon" ? "#E8406A" : "white",
                  color: demoBabySexe === "garcon" ? "white" : "#4A3F5C",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                👦 Garçon
              </button>
            </div>

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              Date de naissance
            </label>
            <input
              type="date"
              value={demoBabyDateNaissance}
              onChange={(e) => {
                setDemoBabyDateNaissance(e.target.value);
                setBabySetupError(null);
              }}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F8",
                fontSize: 15,
                backgroundColor: "#FDF8F2",
                color: "#4A3F5C",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              Poids de naissance (kg)
            </label>
            <input
              type="number"
              value={demoBabyPoidsNaissance}
              onChange={(e) => {
                setDemoBabyPoidsNaissance(e.target.value);
                setBabySetupError(null);
              }}
              placeholder="3.2"
              step="0.1"
              min="0.5"
              max="8"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F8",
                fontSize: 15,
                backgroundColor: "#FDF8F2",
                color: "#4A3F5C",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              Poids actuel (kg)
            </label>
            <input
              type="number"
              value={demoBabyPoidsActuel}
              onChange={(e) => {
                setDemoBabyPoidsActuel(e.target.value);
                setBabySetupError(null);
              }}
              placeholder="4.5"
              step="0.1"
              min="0.5"
              max="15"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F8",
                fontSize: 15,
                backgroundColor: "#FDF8F2",
                color: "#4A3F5C",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                fontSize: 12,
                color: "#8B7FA0",
                marginTop: 6,
                marginBottom: 0,
              }}
            >
              Utilisé pour calculer les doses
            </p>

            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              Parcours
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["allaite", "🤱 Allaitement"],
                  ["artificiel", "🍼 Biberon"],
                  ["mixte", "🤱🍼 Mixte"],
                ] as [DemoParcours, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDemoBabyParcours(value);
                    setBabySetupError(null);
                  }}
                  style={{
                    flex: "1 1 45%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border:
                      demoBabyParcours === value
                        ? "1.5px solid #E8406A"
                        : "1.5px solid #F0E8F8",
                    backgroundColor:
                      demoBabyParcours === value ? "#E8406A" : "white",
                    color: demoBabyParcours === value ? "white" : "#4A3F5C",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleBabySetupSubmit}
              style={{
                width: "100%",
                marginTop: 20,
                padding: "14px",
                borderRadius: 14,
                backgroundColor: "#E8406A",
                color: "white",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                boxShadow: "0 4px 16px rgba(232,64,106,0.35)",
                cursor: "pointer",
              }}
            >
              C&apos;est parti !
            </button>
          </div>
        </div>
      )}

      {/* Popup invitation mode démo */}
      {showSignupModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.4)",
            padding: "0 16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: "white",
              borderRadius: 24,
              padding: 32,
              boxShadow: "0 8px 32px rgba(74,63,92,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#4A3F5C",
                margin: 0,
                textAlign: "center",
              }}
            >
              Les données de {demoBabyName || "votre bébé"} sont en sécurité 🔒
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "#8B7FA0",
                textAlign: "center",
                marginTop: 12,
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Créez votre compte pour ne jamais perdre l&apos;historique et
              partager avec votre famille.
            </p>
            <button
              type="button"
              onClick={() => router.push("/register")}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 14,
                backgroundColor: "#E8406A",
                color: "white",
                fontSize: 16,
                fontWeight: 700,
                border: "none",
                boxShadow: "0 4px 16px rgba(232,64,106,0.35)",
                cursor: "pointer",
              }}
            >
              Créer mon compte
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => router.push("/login")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8B7FA0",
                  fontSize: 13,
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Se connecter
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalSheet open={activeModal === "sieste_start"} onClose={closeModal}>
            <h3 className="text-lg font-bold text-[#4A3F5C]">🌙 Début de sieste</h3>
            <label
              style={{
                display: "block",
                marginTop: 16,
                fontSize: 13,
                color: "#8B7FA0",
              }}
            >
              Heure de début
            </label>
            <input
              type="time"
              value={siesteStartTime}
              onChange={(e) => setSiesteStartTime(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 14,
                border: "1px solid #E8E0F0",
                padding: "12px 14px",
                fontSize: 16,
                color: "#4A3F5C",
              }}
            />
            <p
              style={{
                marginTop: 16,
                fontSize: 13,
                color: "#8B7FA0",
              }}
            >
              Durée estimée (optionnel)
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {SIESTE_DURATION_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() =>
                    setSiesteEstimatedMin(
                      siesteEstimatedMin === min ? null : min
                    )
                  }
                  style={{
                    flex: "1 1 40%",
                    borderRadius: 12,
                    padding: "10px 8px",
                    fontSize: 13,
                    fontWeight: 600,
                    border:
                      siesteEstimatedMin === min
                        ? "2px solid #E8406A"
                        : "1px solid #E8E0F0",
                    backgroundColor:
                      siesteEstimatedMin === min ? "#FFF0F4" : "white",
                    color: "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {min < 60 ? `${min}min` : min === 60 ? "1h" : min === 90 ? "1h30" : "2h"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSiesteStart}
              disabled={saving}
              style={{
                marginTop: 20,
                width: "100%",
                backgroundColor: "#E8406A",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Sieste commencée 🌙
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
            >
              Annuler
            </button>
      </ModalSheet>

      <ModalSheet
        open={activeModal === "sieste_end" && Boolean(activeSieste)}
        onClose={closeModal}
      >
            <h3 className="text-lg font-bold text-[#4A3F5C]">🌙 Fin de sieste</h3>
            <label
              style={{
                display: "block",
                marginTop: 16,
                fontSize: 13,
                color: "#8B7FA0",
              }}
            >
              Heure de réveil
            </label>
            <input
              type="time"
              value={siesteEndTime}
              onChange={(e) => setSiesteEndTime(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 14,
                border: "1px solid #E8E0F0",
                padding: "12px 14px",
                fontSize: 16,
                color: "#4A3F5C",
              }}
            />
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: "#4A3F5C",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Durée : {formatDurationHM(siesteEndDurationMin)}
            </p>
            <button
              type="button"
              onClick={handleSiesteEnd}
              disabled={saving}
              style={{
                marginTop: 16,
                width: "100%",
                backgroundColor: "#E8406A",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
            >
              Annuler
            </button>
      </ModalSheet>

      <ModalSheet open={activeModal === "nuit"} onClose={closeModal}>
            <h3 className="text-lg font-bold text-[#4A3F5C]">🌙 Résumé de nuit</h3>

            <label style={{ display: "block", marginTop: 16, fontSize: 13, color: "#8B7FA0" }}>
              Heure de coucher
            </label>
            <input
              type="time"
              value={nuitCoucher}
              onChange={(e) => setNuitCoucher(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 14,
                border: "1px solid #E8E0F0",
                padding: "12px 14px",
                fontSize: 16,
                color: "#4A3F5C",
              }}
            />

            <label style={{ display: "block", marginTop: 14, fontSize: 13, color: "#8B7FA0" }}>
              Heure de lever
            </label>
            <input
              type="time"
              value={nuitLever}
              onChange={(e) => setNuitLever(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 14,
                border: "1px solid #E8E0F0",
                padding: "12px 14px",
                fontSize: 16,
                color: "#4A3F5C",
              }}
            />

            <p style={{ marginTop: 16, fontSize: 13, color: "#8B7FA0" }}>
              Nombre de réveils
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {NUIT_REVEIL_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleReveilCountChange(n)}
                  style={{
                    flex: "1 1 18%",
                    minWidth: 44,
                    borderRadius: 12,
                    padding: "10px 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    border:
                      nuitReveilCount === n
                        ? "2px solid #E8406A"
                        : "1px solid #E8E0F0",
                    backgroundColor: nuitReveilCount === n ? "#FFF0F4" : "white",
                    color: "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {n === 4 ? "4+" : n}
                </button>
              ))}
            </div>

            {nuitReveils.map((reveil, index) => (
              <div
                key={index}
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: "#FDF8F2",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: "#4A3F5C", margin: "0 0 8px" }}>
                  Réveil {index + 1}
                </p>
                <label style={{ fontSize: 12, color: "#8B7FA0" }}>Heure</label>
                <input
                  type="time"
                  value={reveil.heure}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNuitReveils((prev) =>
                      prev.map((r, i) =>
                        i === index ? { ...r, heure: val } : r
                      )
                    );
                  }}
                  style={{
                    marginTop: 4,
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid #E8E0F0",
                    padding: "10px 12px",
                    fontSize: 14,
                    color: "#4A3F5C",
                  }}
                />
                <p style={{ marginTop: 10, fontSize: 12, color: "#8B7FA0" }}>Cause</p>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {REVEIL_CAUSES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setNuitReveils((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, cause: c.id } : r
                          )
                        )
                      }
                      style={{
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        border:
                          reveil.cause === c.id
                            ? "2px solid #E8406A"
                            : "1px solid #E8E0F0",
                        backgroundColor:
                          reveil.cause === c.id ? "#FFF0F4" : "white",
                        color: "#4A3F5C",
                        cursor: "pointer",
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: 10, fontSize: 12, color: "#8B7FA0" }}>
                  Durée avant rendormissement
                </p>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {REVEIL_DUREES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setNuitReveils((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, duree: d.id } : r
                          )
                        )
                      }
                      style={{
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        border:
                          reveil.duree === d.id
                            ? "2px solid #E8406A"
                            : "1px solid #E8E0F0",
                        backgroundColor:
                          reveil.duree === d.id ? "#FFF0F4" : "white",
                        color: "#4A3F5C",
                        cursor: "pointer",
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleNuitSubmit}
              disabled={saving}
              style={{
                marginTop: 20,
                width: "100%",
                backgroundColor: "#E8406A",
                color: "white",
                border: "none",
                borderRadius: 14,
                padding: "14px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Enregistrer la nuit
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
            >
              Annuler
            </button>
      </ModalSheet>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key={toastKey}
            initial={{ opacity: 0, y: 50, scale: 0.8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 50, scale: 0.8, x: "-50%" }}
            transition={{ type: "spring", stiffness: 400 }}
            style={{
              position: "fixed",
              bottom: 96,
              left: "50%",
              backgroundColor: "#4A3F5C",
              color: "white",
              borderRadius: 16,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              maxWidth: "calc(100% - 32px)",
              textAlign: "center",
              zIndex: 60,
              boxShadow: "0 8px 24px rgba(74,63,92,0.25)",
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <ModalSheet open={activeModal === "pleure"} onClose={closeModal}>
            <h3 className="text-lg font-bold text-[#4A3F5C]">😢 Bébé pleure</h3>
            <p className="mt-1 text-sm text-[#8B7FA0]">
              Quelle pourrait être la cause ?
            </p>
            <ul className="mt-4 space-y-2">
              {pleureSuggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => addEvent("pleure", suggestion)}
                    disabled={saving}
                    className="w-full rounded-2xl px-4 py-3 text-left text-sm font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: "#E8406A" }}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]"
            >
              Annuler
            </button>
      </ModalSheet>
    </main>
  );
}
