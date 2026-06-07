'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  fetchEvents as fetchEventsFromDb,
  formatTimeShort,
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
  getOrCreateSessionId,
  hasDemoBaby,
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
  getBiberonRecommandation,
  getBiberonAlertState,
  getBiberonToast,
  formatBiberonInverseTimer,
  resolveBiberonInputMode,
  serializeTeteeNote,
  getTeteeToast,
} from "@/lib/biberon";
import {
  countTodayEvents,
  getEventToastMessage,
  isToday,
  type BabyMessageContext,
} from "@/lib/dashboard-messages";
import {
  calcDurationBetweenTimes,
  calcSleepMinutes,
  combineDateAndTime,
  countTodayReveils,
  dismissNightBanner,
  formatDurationCompact,
  formatDurationHM,
  genderEveille,
  genderIlElle,
  genderReveille,
  getNightAnalysis,
  getSiesteEndToast,
  hasNightRecordedToday,
  isMorningPromptHour,
  isNightBannerDismissed,
  isNightModeHour,
  loadNightBedtime,
  saveNightBedtime,
  serializeNote,
  SOMMEIL_REVEIL_COUNTS,
  toTimeInputValue,
  type SommeilMeta,
} from "@/lib/sleep";
import { BabyAvatar } from "@/components/BabyAvatar";
import { ModalSheet } from "@/components/ModalSheet";
import { AnimatePresence, motion } from "framer-motion";
import { loadAuthAvatarUrl, loadBabyAvatar } from "@/lib/avatar";
import type { BebebouEvent, EventType } from "@/lib/supabase";

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
  | "sommeil_choice"
  | "sommeil_form"
  | null;

type SleepFormType = "sieste" | "nuit";

type AddEventOptions = {
  createdAt?: string;
  customToast?: string;
};

type AuthenticatedBaby = {
  id: string;
  prenom?: string | null;
  name?: string | null;
  date_naissance?: string | null;
  birthdate?: string | null;
  sexe?: string | null;
  poids_naissance?: number | null;
  poids_actuel?: number | null;
  parcours?: string | null;
  family_id?: string | null;
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

function getEffectivePoids(baby: {
  poids_actuel?: number | null;
  poids_naissance?: number | null;
}): number | null {
  return baby.poids_actuel ?? baby.poids_naissance ?? null;
}

function getCurrentTimeValue(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function buildCreatedAtFromTime(selectedTime: string): string {
  const [hours, minutes] = selectedTime.split(":");
  const eventDate = new Date();
  eventDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return eventDate.toISOString();
}

function HomeSkeleton() {
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#FDF8F2" }}
    >
      <header
        style={{
          padding: "24px 20px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <img
          src="/logo-horizontal.png"
          alt="Mon Bebebou"
          style={{
            width: "100%",
            maxWidth: 400,
            height: "auto",
            display: "block",
          }}
        />
      </header>
      <div
        style={{
          maxWidth: 448,
          margin: "0 auto",
          padding: "0 16px 32px",
        }}
      >
        <div
          className="animate-pulse rounded-3xl"
          style={{
            height: 48,
            backgroundColor: "#E8E0ED",
            marginBottom: 16,
          }}
        />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-3xl"
              style={{
                height: 120,
                backgroundColor: "#E8E0ED",
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
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
  const [biberonTakeTime, setBiberonTakeTime] = useState(getCurrentTimeValue);
  const [biberonInputMode, setBiberonInputMode] = useState<
    "choice" | "ml" | "tetee"
  >("ml");
  const [teteeMinutes, setTeteeMinutes] = useState("15");
  const [teteeSein, setTeteeSein] = useState<"gauche" | "droit" | null>(null);
  const [biberonTick, setBiberonTick] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [babyInfo, setBabyInfo] = useState("votre bébé");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [skeletonRevealed, setSkeletonRevealed] = useState(false);
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
  const [babySetupError, setBabySetupError] = useState<string | null>(null);
  const [babyContext, setBabyContext] = useState<BabyMessageContext | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userScopeId, setUserScopeId] = useState("");
  const [baby, setBaby] = useState<AuthenticatedBaby | null>(null);
  const [nightUiTick, setNightUiTick] = useState(0);
  const [siesteStartTime, setSiesteStartTime] = useState(toTimeInputValue());
  const [siesteEndTime, setSiesteEndTime] = useState(toTimeInputValue());
  const [nuitCoucher, setNuitCoucher] = useState("21:00");
  const [nuitLever, setNuitLever] = useState("07:00");
  const [nuitReveilCount, setNuitReveilCount] = useState(0);
  const [sleepFormType, setSleepFormType] = useState<SleepFormType | null>(null);

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
    if (babyContext?.date_naissance && getEffectivePoids(babyContext)) {
      return babyContext;
    }
    const baby = demoBaby ?? getDemoBaby(demoSessionId);
    if (!baby) return null;
    return {
      prenom: baby.prenom,
      sexe: baby.sexe,
      date_naissance: baby.date_naissance,
      poids_naissance: baby.poids_naissance,
      poids_actuel: baby.poids_actuel ?? baby.poids_naissance,
      parcours: baby.parcours,
    };
  }

  function applyAuthenticatedBabyToUI(babyData: AuthenticatedBaby) {
    const prenom = babyData.prenom ?? babyData.name;
    const birthdate = babyData.date_naissance ?? babyData.birthdate;
    if (prenom && birthdate) {
      setBabyInfo(`${prenom} · ${getBabyAge(birthdate)}`);
      setBabyContext({
        prenom,
        sexe: (babyData.sexe as DemoBabySexe) ?? null,
        date_naissance: birthdate,
        poids_naissance: babyData.poids_naissance ?? null,
        poids_actuel: babyData.poids_actuel ?? babyData.poids_naissance ?? null,
        parcours: (babyData.parcours as DemoParcours) ?? null,
      });
    }
  }

  async function loadAnonymousDemoData() {
    setIsAuthenticated(false);
    setBaby(null);
    setUserEmail(null);
    setUserScopeId("");

    const sessionId = getOrCreateSessionId();
    const storedBaby = getDemoBaby(sessionId);

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
    } catch (error) {
      console.error("Demo error:", error);
    }
  }

  async function loadBabyData(): Promise<AuthenticatedBaby | null> {
    const supabaseClient = createSupabaseClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      await loadAnonymousDemoData();
      return null;
    }

    setIsAuthenticated(true);
    setUserEmail(user.email ?? null);
    setUserScopeId(user.id);

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("family_id, prenom_maman, prenom_papa")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile load error:", profileError);
    }

    if (!profile?.family_id) {
      console.error("No family_id on profile for user", user.id);
      setBaby(null);
      return null;
    }

    const { data: babyData, error: babyError } = await supabaseClient
      .from("babies")
      .select("*")
      .eq("family_id", profile.family_id)
      .single();

    if (babyError) {
      console.error("Baby load error:", babyError);
    }

    if (!babyData) {
      setBaby(null);
      return null;
    }

    setBaby(babyData);
    console.log("Baby loaded:", babyData.id, babyData.prenom);
    applyAuthenticatedBabyToUI(babyData);
    return babyData;
  }

  function openBiberonModal() {
    const profile = getFeedingProfile();
    const recommended = profile?.date_naissance
      ? getBiberonRecommandation(getAgeInDays(profile.date_naissance)).ml
      : 120;
    setBiberonMl(String(recommended));
    setBiberonMlEdited(false);
    setBiberonTakeTime(getCurrentTimeValue());
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

  useLayoutEffect(() => {
    const sessionId = getOrCreateSessionId();
    setDemoSessionId(sessionId);

    const storedBaby = getDemoBaby(sessionId);
    if (storedBaby) {
      applyDemoBabyToUI(storedBaby);
    } else {
      setDemoBaby(null);
      setBabyInfo("votre bébé");
    }

    setDemoReady(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSkeletonRevealed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (authChecked) setSkeletonRevealed(true);
  }, [authChecked]);

  useEffect(() => {
    async function init() {
      try {
        const babyData = await loadBabyData();
        if (babyData) {
          const supabaseClient = createSupabaseClient();
          const {
            data: { user },
          } = await supabaseClient.auth.getUser();
          if (user) {
            const data = await fetchEventsFromDb(user.id);
            setEvents(data);
          }
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        setAuthChecked(true);
      }
    }

    init();
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

    let babyRecord = baby;
    if (!babyRecord?.id) {
      babyRecord = await loadBabyData();
    }

    if (!babyRecord?.id) {
      setError(
        "Erreur d'enregistrement : profil bébé introuvable (baby_id manquant)"
      );
      setSaving(false);
      return;
    }

    const supabaseClient = createSupabaseClient();
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const valeur = quantity ?? null;
    const row: Record<string, unknown> = {
      baby_id: babyRecord.id,
      type: eventType,
      note: note ?? null,
      quantity: valeur,
      user_id: user.id,
      created_at: options?.createdAt ?? new Date().toISOString(),
    };

    console.log("Saving event for baby:", babyRecord.id);

    const { data, error: insertError } = await supabaseClient
      .from("events")
      .insert(row)
      .select()
      .single();

    console.log("Insert result:", data, insertError);

    if (insertError) {
      console.error(insertError);
      setError(`Erreur d'enregistrement : ${insertError.message}`);
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

  function openSommeilChoice() {
    setSleepFormType(null);
    setError(null);
    setActiveModal("sommeil_choice");
  }

  function openSommeilForm(type: SleepFormType) {
    setSleepFormType(type);
    if (type === "sieste") {
      const now = toTimeInputValue();
      setSiesteStartTime(now);
      setSiesteEndTime(now);
    } else {
      setNuitCoucher(loadNightBedtime() ?? "21:00");
      setNuitLever(toTimeInputValue());
      setNuitReveilCount(0);
    }
    setActiveModal("sommeil_form");
  }

  function openSommeilNuitForm() {
    openSommeilForm("nuit");
  }

  function handleSommeilTypeSelect(type: SleepFormType) {
    openSommeilForm(type);
  }

  function handleSiesteSubmit() {
    const ctx = babyContext ?? (demoBaby ? {
      prenom: demoBaby.prenom,
      date_naissance: demoBaby.date_naissance,
    } : null);
    if (!ctx?.prenom) return;

    const durationMin = calcDurationBetweenTimes(siesteStartTime, siesteEndTime);
    const meta: SommeilMeta = {
      heure_debut: siesteStartTime,
      heure_fin: siesteEndTime,
    };
    const endDate = combineDateAndTime(new Date(), siesteEndTime);
    const toast = getSiesteEndToast(
      ctx.prenom,
      durationMin,
      ctx.date_naissance
    );
    setActiveModal(null);
    setSleepFormType(null);
    addEvent("sieste", serializeNote(meta), durationMin, {
      createdAt: endDate.toISOString(),
      customToast: toast,
    });
  }

  function handleNuitSubmit() {
    const prenom = babyContext?.prenom ?? demoBaby?.prenom;
    const dateNaissance =
      babyContext?.date_naissance ?? demoBaby?.date_naissance;
    if (!prenom) return;

    const durationMin = calcSleepMinutes(nuitCoucher, nuitLever);
    const meta: SommeilMeta = {
      heure_debut: nuitCoucher,
      heure_fin: nuitLever,
      nb_reveils: nuitReveilCount,
    };
    const leverDate = combineDateAndTime(new Date(), nuitLever);
    const analysis = getNightAnalysis(prenom, dateNaissance, {
      coucher: nuitCoucher,
      lever: nuitLever,
      reveils: [],
      totalReveils: nuitReveilCount,
    });
    setActiveModal(null);
    setSleepFormType(null);
    addEvent("nuit", serializeNote(meta), durationMin, {
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
      case "nuit":
        openSommeilChoice();
        break;
      case "pleure":
        setActiveModal("pleure");
        break;
    }
  }

  function handleSommeilClick() {
    if (saving) return;

    const sessionId = demoSessionId || getOrCreateSessionId();
    if (!isAuthenticated && !hasDemoBaby(sessionId)) {
      setPendingCardType("sieste");
      setBabySetupError(null);
      setShowBabySetupModal(true);
      return;
    }

    openSommeilChoice();
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
    addEvent("biberon", undefined, quantity, {
      customToast: toast,
      createdAt: buildCreatedAtFromTime(biberonTakeTime),
    });
  }

  function closeModal() {
    if (!saving) {
      setActiveModal(null);
      setSleepFormType(null);
    }
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

  const siesteFormDurationMin = useMemo(
    () => calcDurationBetweenTimes(siesteStartTime, siesteEndTime),
    [siesteStartTime, siesteEndTime]
  );

  const nuitFormDurationMin = useMemo(
    () => calcSleepMinutes(nuitCoucher, nuitLever),
    [nuitCoucher, nuitLever]
  );

  const lastSleepEvent = useMemo(
    () => events.find((e) => e.type === "sieste" || e.type === "nuit") ?? null,
    [events]
  );

  const sommeilSubtitle = useMemo(() => {
    if (!lastSleepEvent) return "Aucun enregistrement";
    return getCardSubtitle(lastSleepEvent.type, events);
  }, [lastSleepEvent, events]);

  const feedingProfile = getFeedingProfile();
  const recommendedMl = feedingProfile?.date_naissance
    ? getBiberonRecommandation(getAgeInDays(feedingProfile.date_naissance)).ml
    : 120;

  const biberonAlert = useMemo(() => {
    void biberonTick;
    if (!feedingProfile?.prenom || !feedingProfile.date_naissance) return null;
    return getBiberonAlertState({
      dernierBiberon: lastBiberon ?? null,
      prenom: feedingProfile.prenom,
      sexe: feedingProfile.sexe,
      ageEnJours: getAgeInDays(feedingProfile.date_naissance),
      parcours: feedingProfile.parcours ?? "artificiel",
    });
  }, [biberonTick, lastBiberon, feedingProfile]);

  const biberonInverseTimer = useMemo(() => {
    void biberonTick;
    if (
      !biberonAlert?.afficherMinuteurInverse ||
      !biberonAlert.minuteurMode ||
      !lastBiberon ||
      !feedingProfile?.date_naissance
    ) {
      return null;
    }
    return formatBiberonInverseTimer(
      lastBiberon.created_at,
      getAgeInDays(feedingProfile.date_naissance),
      feedingProfile.parcours ?? "artificiel",
      biberonAlert.minuteurMode
    );
  }, [biberonTick, biberonAlert, lastBiberon, feedingProfile]);

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

  if (!skeletonRevealed) {
    return <HomeSkeleton />;
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>
      {/* Logo + avatar */}
      <header
        className="relative"
        style={{
          padding: "24px 20px",
          minHeight: "140px",
          display: "flex",
          justifyContent: "center",
        }}
      >
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
          style={{
            width: "100%",
            maxWidth: "400px",
            height: "auto",
            display: "block",
            margin: "0 auto",
          }}
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
              onClick={openSommeilNuitForm}
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
          {biberonAlert && !biberonAlert.bandeauCouleur && (
            <motion.section
              key={biberonAlert.message}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{
                backgroundColor: "white",
                borderRadius: 16,
                padding: 16,
                boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "#4A3F5C",
                  margin: 0,
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                {biberonAlert.message}
              </p>
            </motion.section>
          )}
        </AnimatePresence>

        {biberonAlert?.bandeauCouleur && (
          <motion.section
            animate={{ backgroundColor: biberonAlert.bandeauCouleur }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl px-4 py-3 shadow-md"
          >
            <p className="text-sm leading-relaxed text-[#4A3F5C]">
              {biberonAlert.message}
            </p>
          </motion.section>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
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
            {biberonInverseTimer ? (
              <>
                <p
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color:
                      biberonAlert?.minuteurMode === "overtime"
                        ? "#E8406A"
                        : "#8B7FA0",
                    fontWeight: 600,
                  }}
                >
                  {biberonAlert?.message}
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 16,
                    fontWeight: 700,
                    color:
                      biberonAlert?.minuteurMode === "overtime"
                        ? "#E8406A"
                        : "#4A3F5C",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {biberonInverseTimer}
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

          <motion.button
            type="button"
            onClick={handleSommeilClick}
            disabled={saving}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            className="rounded-3xl p-5 text-center shadow-md disabled:opacity-60"
            style={{ backgroundColor: "#EEE8FF" }}
          >
            <p className="text-4xl">😴</p>
            <p className="mt-2 font-bold text-[#4A3F5C]">Sommeil</p>
            <p className="mt-1 text-xs text-[#8B7FA0]">
              {saving ? "Enregistrement..." : sommeilSubtitle}
            </p>
          </motion.button>

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

          {todayEvents.length === 0 ? (
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
                <p
                  style={{
                    marginTop: 16,
                    marginBottom: 8,
                    fontSize: 13,
                    color: "#8B7FA0",
                  }}
                >
                  Heure de la prise
                </p>
                <input
                  type="time"
                  value={biberonTakeTime}
                  onChange={(e) => setBiberonTakeTime(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1.5px solid #F0E8F5",
                    fontSize: 16,
                    backgroundColor: "#FDF8F2",
                    textAlign: "center",
                    boxSizing: "border-box",
                  }}
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
                      {(() => {
                        const age = formatExactBabyAge(
                          feedingProfile.date_naissance
                        );
                        const base = `Recommandé pour ${feedingProfile.prenom} à ${age}`;
                        const poids =
                          feedingProfile.poids_actuel ??
                          feedingProfile.poids_naissance;
                        return poids
                          ? `${base} · ${poids}kg`
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

      <ModalSheet open={activeModal === "sommeil_choice"} onClose={closeModal} centered>
        <h2
          style={{
            margin: 0,
            marginBottom: 24,
            fontSize: 18,
            fontWeight: 700,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          🌙 Quel type de sommeil ?
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => handleSommeilTypeSelect("sieste")}
            style={{
              flex: 1,
              backgroundColor: "#EEE8FF",
              borderRadius: 20,
              padding: 24,
              border:
                sleepFormType === "sieste"
                  ? "2px solid #9B59B6"
                  : "2px solid transparent",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 40, display: "block" }}>😴</span>
            <span
              style={{
                display: "block",
                fontSize: 16,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 8,
              }}
            >
              Sieste
            </span>
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "#8B7FA0",
                marginTop: 4,
              }}
            >
              Repos de la journée
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSommeilTypeSelect("nuit")}
            style={{
              flex: 1,
              backgroundColor: "#E8F4FF",
              borderRadius: 20,
              padding: 24,
              border:
                sleepFormType === "nuit"
                  ? "2px solid #3498DB"
                  : "2px solid transparent",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 40, display: "block" }}>🌙</span>
            <span
              style={{
                display: "block",
                fontSize: 16,
                fontWeight: 600,
                color: "#4A3F5C",
                marginTop: 8,
              }}
            >
              Nuit
            </span>
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "#8B7FA0",
                marginTop: 4,
              }}
            >
              Sommeil nocturne
            </span>
          </button>
        </div>
      </ModalSheet>

      <ModalSheet open={activeModal === "sommeil_form"} onClose={closeModal} centered>
        {sleepFormType === "sieste" && (
          <>
            <h2
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 700,
                color: "#4A3F5C",
                textAlign: "center",
              }}
            >
              😴 Sieste de {babyContext?.prenom ?? demoBabyName ?? "bébé"}
            </h2>
            <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>
              Heure début
            </label>
            <input
              type="time"
              value={siesteStartTime}
              onChange={(e) => setSiesteStartTime(e.target.value)}
              style={{
                marginTop: 6,
                marginBottom: 16,
                width: "100%",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                padding: "12px 16px",
                fontSize: 16,
                backgroundColor: "#FDF8F2",
                boxSizing: "border-box",
              }}
            />
            <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>
              Heure fin
            </label>
            <input
              type="time"
              value={siesteEndTime}
              onChange={(e) => setSiesteEndTime(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                padding: "12px 16px",
                fontSize: 16,
                backgroundColor: "#FDF8F2",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: "#8B7FA0",
                textAlign: "center",
              }}
            >
              Durée : {formatDurationCompact(siesteFormDurationMin)}
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button
                type="button"
                onClick={closeModal}
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
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSiesteSubmit}
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
                  cursor: "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Enregistrer ✓
              </button>
            </div>
          </>
        )}
        {sleepFormType === "nuit" && (
          <>
            <h2
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 700,
                color: "#4A3F5C",
                textAlign: "center",
              }}
            >
              🌙 Nuit de {babyContext?.prenom ?? demoBabyName ?? "bébé"}
            </h2>
            <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>
              Heure coucher
            </label>
            <input
              type="time"
              value={nuitCoucher}
              onChange={(e) => setNuitCoucher(e.target.value)}
              style={{
                marginTop: 6,
                marginBottom: 16,
                width: "100%",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                padding: "12px 16px",
                fontSize: 16,
                backgroundColor: "#FDF8F2",
                boxSizing: "border-box",
              }}
            />
            <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>
              Heure lever
            </label>
            <input
              type="time"
              value={nuitLever}
              onChange={(e) => setNuitLever(e.target.value)}
              style={{
                marginTop: 6,
                width: "100%",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                padding: "12px 16px",
                fontSize: 16,
                backgroundColor: "#FDF8F2",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                marginTop: 16,
                fontSize: 13,
                color: "#8B7FA0",
              }}
            >
              Réveils cette nuit
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {SOMMEIL_REVEIL_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNuitReveilCount(n)}
                  style={{
                    flex: "1 1 14%",
                    minWidth: 44,
                    borderRadius: 12,
                    padding: "10px 6px",
                    fontSize: 13,
                    fontWeight: 600,
                    border:
                      nuitReveilCount === n
                        ? "2px solid #E8406A"
                        : "1.5px solid #F0E8F5",
                    backgroundColor:
                      nuitReveilCount === n ? "#E8406A" : "white",
                    color: nuitReveilCount === n ? "white" : "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {n === 5 ? "5+" : n}
                </button>
              ))}
            </div>
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: "#8B7FA0",
                textAlign: "center",
              }}
            >
              Durée : {formatDurationCompact(nuitFormDurationMin)}
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button
                type="button"
                onClick={closeModal}
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
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleNuitSubmit}
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
                  cursor: "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Enregistrer ✓
              </button>
            </div>
          </>
        )}
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
