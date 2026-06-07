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
  fetchEventsByBabyId,
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
  getDemoRemainingHours,
  hasDemoBaby,
  hasDemoSessionStarted,
  isDemoSessionPast24h,
  saveWeightLocalStorage,
  insertDemoEvent,
  markInvite8Shown,
  saveDemoBaby,
  wasInvite8Shown,
  DEMO_STARTED_AT_KEY,
  DEMO_SESSION_KEY,
  DEMO_BABY_KEY,
  POIDS_NAISSANCE_KEY,
  POIDS_ACTUEL_KEY,
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
  clearModeNuit,
  clearSiesteActive,
  combineDateAndTime,
  countTodayReveils,
  dismissNightBanner,
  buildFinTimestampAfterStart,
  formatChronometer,
  formatDurationCompact,
  formatDurationHM,
  formatSiesteDurationShort,
  genderEveille,
  genderIlElle,
  genderReveille,
  getNightAnalysis,
  getNightModeBiberonMessage,
  hasNightRecordedToday,
  isMorningPromptHour,
  isNightBannerDismissed,
  isNightModeHour,
  loadModeNuit,
  loadNightBedtime,
  loadSiesteActive,
  saveModeNuit,
  saveNightBedtime,
  saveSiesteActive,
  serializeNote,
  SOMMEIL_REVEIL_COUNTS,
  toTimeInputValue,
  type ModeNuitState,
  type SommeilMeta,
} from "@/lib/sleep";
import { BabyAvatar } from "@/components/BabyAvatar";
import { ModalSheet } from "@/components/ModalSheet";
import {
  COUCHE_TYPE_OPTIONS,
  getCoucheDashboardAlerts,
  getCoucheModalAlerts,
  includesPipi,
  includesSelle,
  SELLE_CONSISTANCE_OPTIONS,
  SELLE_COULEUR_OPTIONS,
  SELLE_ODEUR_OPTIONS,
  SELLE_QUANTITE_OPTIONS,
  SIGNES_ASSOCIES_OPTIONS,
  URINE_COULEUR_OPTIONS,
  URINE_QUANTITE_OPTIONS,
  type CoucheMeta,
  type Intolerance,
  type TypeCouche,
  type TypeLait,
} from "@/lib/couche";
import { AnimatePresence, motion } from "framer-motion";
import { loadAuthAvatarUrl, loadBabyAvatar } from "@/lib/avatar";
import type { BebebouEvent, EventType } from "@/lib/supabase";
import { getRoleLabel } from "@/lib/roles";
import {
  type FamilyMemberProfile,
  extractOnlineUserIds,
  getMemberPrenom,
} from "@/lib/family";

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
  | "sommeil_sieste_start"
  | "sommeil_sieste_end"
  | "sommeil_nuit_start"
  | "sommeil_nuit_wake"
  | null;

type SleepFormType = "sieste" | "nuit";

type AddEventOptions = {
  createdAt?: string;
  customToast?: string;
  toastDuration?: number;
  toastBackgroundColor?: string;
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
  mode_nuit?: ModeNuitState | null;
  type_lait?: string | null;
  intolerances?: Intolerance[] | null;
};

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function syncLegacyBabyLocalStorage(baby: DemoBaby) {
  if (typeof window === "undefined") return;
  localStorage.setItem("baby_prenom", baby.prenom);
  localStorage.setItem("baby_sexe", baby.sexe);
  localStorage.setItem("baby_date_naissance", baby.date_naissance);
  localStorage.setItem("baby_poids", String(baby.poids_naissance));
  localStorage.setItem("baby_poids_actuel", String(baby.poids_actuel));
  localStorage.setItem("baby_parcours", baby.parcours);
}

function clearDemoLocalStorageForAuthenticatedUser() {
  if (typeof window === "undefined") return;
  [
    "baby_prenom",
    "baby_sexe",
    "baby_date_naissance",
    "baby_poids",
    "baby_poids_actuel",
    "baby_parcours",
    "baby_avatar",
    "baby_photo",
    "demo_start_time",
    "demo_events",
    "bebebou-demo-events-fallback",
    DEMO_STARTED_AT_KEY,
    DEMO_SESSION_KEY,
    DEMO_BABY_KEY,
    POIDS_NAISSANCE_KEY,
    POIDS_ACTUEL_KEY,
  ].forEach((key) => localStorage.removeItem(key));
}

function hasLegacyBabyPrenom(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem("baby_prenom")?.trim());
}

function loadLegacyBabyFromLocalStorage(sessionId: string): DemoBaby | null {
  if (typeof window === "undefined") return null;
  const prenom = localStorage.getItem("baby_prenom")?.trim();
  if (!prenom) return null;
  const sexe = localStorage.getItem("baby_sexe") as DemoBabySexe | null;
  const date_naissance = localStorage.getItem("baby_date_naissance");
  const parcours = localStorage.getItem("baby_parcours") as DemoParcours | null;
  if (!sexe || !date_naissance || !parcours) return null;
  const poidsActuel = parseFloat(
    (localStorage.getItem("baby_poids_actuel") ?? "").replace(",", ".")
  );
  if (!poidsActuel || poidsActuel <= 0) return null;
  const poidsNaissance = parseFloat(
    (localStorage.getItem("baby_poids") ?? "").replace(",", ".")
  );
  return {
    session_id: sessionId,
    prenom,
    sexe,
    date_naissance,
    poids_naissance:
      poidsNaissance && poidsNaissance > 0 ? poidsNaissance : poidsActuel,
    poids_actuel: poidsActuel,
    parcours,
  };
}

function hasCompleteDemoProfile(sessionId: string): boolean {
  if (hasDemoBaby(sessionId)) return true;
  return loadLegacyBabyFromLocalStorage(sessionId) !== null;
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
  const [babySetupStep, setBabySetupStep] = useState<"prenom" | "details">("prenom");
  const [demoSessionId, setDemoSessionId] = useState("");
  const [demoBabyPrenom, setDemoBabyPrenom] = useState("");
  const [demoBabySexe, setDemoBabySexe] = useState<DemoBabySexe | "">("");
  const [demoBabyDateNaissance, setDemoBabyDateNaissance] = useState("");
  const [demoBabyPoidsActuel, setDemoBabyPoidsActuel] = useState("");
  const [demoBabyParcours, setDemoBabyParcours] = useState<DemoParcours | "">("");
  const [demoBaby, setDemoBaby] = useState<DemoBaby | null>(null);
  const [demoBabyName, setDemoBabyName] = useState("");
  const [lastRecordedEventType, setLastRecordedEventType] =
    useState<EventType | null>(null);
  const [pendingCardType, setPendingCardType] = useState<EventType | null>(null);
  const [demoReady, setDemoReady] = useState(false);
  const [demoBannerMode, setDemoBannerMode] = useState<"active" | "expired" | null>(
    null
  );
  const [demoRemainingHours, setDemoRemainingHours] = useState(24);
  const [babySetupError, setBabySetupError] = useState<string | null>(null);
  const [babyContext, setBabyContext] = useState<BabyMessageContext | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastBackgroundColor, setToastBackgroundColor] = useState("#4A3F5C");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastKey, setToastKey] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberProfile[]>([]);
  const [myRole, setMyRole] = useState("");
  const [myPrenom, setMyPrenom] = useState("");
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const [userScopeId, setUserScopeId] = useState("");
  const [baby, setBaby] = useState<AuthenticatedBaby | null>(null);
  const [nightUiTick, setNightUiTick] = useState(0);
  const [modeNuit, setModeNuit] = useState(false);
  const [modeNuitData, setModeNuitData] = useState<ModeNuitState | null>(null);
  const [siesteActive, setSiesteActive] = useState(false);
  const [siesteHeureDebut, setSiesteHeureDebut] = useState<Date | null>(null);
  const [siesteHeureDebutInput, setSiesteHeureDebutInput] = useState(() =>
    getCurrentTimeValue()
  );
  const [siesteHeureFinInput, setSiesteHeureFinInput] = useState(() =>
    toTimeInputValue()
  );
  const [chronoTick, setChronoTick] = useState(0);
  const [nuitCoucher, setNuitCoucher] = useState(toTimeInputValue());
  const [nuitReveilsPrevus, setNuitReveilsPrevus] = useState(0);
  const [nuitLever, setNuitLever] = useState(toTimeInputValue());
  const [nuitReveilCount, setNuitReveilCount] = useState(0);
  const [coucheHeure, setCoucheHeure] = useState(() => getCurrentTimeValue());
  const [coucheType, setCoucheType] = useState<TypeCouche | null>(null);
  const [urineCouleur, setUrineCouleur] = useState("jaune_pale");
  const [urineQuantite, setUrineQuantite] = useState("normale");
  const [selleCouleur, setSelleCouleur] = useState("jaune_moutarde");
  const [selleConsistance, setSelleConsistance] = useState("granuleuse");
  const [selleQuantite, setSelleQuantite] = useState("normale");
  const [selleOdeur, setSelleOdeur] = useState("normale");
  const [signesAssocies, setSignesAssocies] = useState<string[]>([]);

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
      type_lait: baby.type_lait ?? null,
      intolerances: baby.intolerances ?? null,
    });
    syncLegacyBabyLocalStorage(baby);
  }

  function applyPartialLegacyBabyFromLocalStorage() {
    if (typeof window === "undefined") return;
    const prenom = localStorage.getItem("baby_prenom")?.trim();
    if (!prenom) return;
    const sexe = localStorage.getItem("baby_sexe") as DemoBabySexe | null;
    const date_naissance = localStorage.getItem("baby_date_naissance");
    const parcours = localStorage.getItem("baby_parcours") as DemoParcours | null;
    const poidsActuel = parseFloat(
      (localStorage.getItem("baby_poids_actuel") ?? "").replace(",", ".")
    );
    setDemoBabyName(prenom);
    setBabyInfo(
      date_naissance
        ? `${prenom} · ${getBabyAge(date_naissance)}`
        : prenom
    );
    setBabyContext({
      prenom,
      sexe: sexe ?? null,
      date_naissance: date_naissance ?? null,
      poids_naissance: null,
      poids_actuel: poidsActuel > 0 ? poidsActuel : null,
      parcours: parcours ?? null,
      type_lait: null,
      intolerances: null,
    });
  }

  function prefillBabySetupFromLocalStorage() {
    if (typeof window === "undefined") return;
    setDemoBabyPrenom(localStorage.getItem("baby_prenom")?.trim() ?? "");
    setDemoBabySexe(
      (localStorage.getItem("baby_sexe") as DemoBabySexe | null) ?? ""
    );
    setDemoBabyDateNaissance(localStorage.getItem("baby_date_naissance") ?? "");
    setDemoBabyPoidsActuel(localStorage.getItem("baby_poids_actuel") ?? "");
    setDemoBabyParcours(
      (localStorage.getItem("baby_parcours") as DemoParcours | null) ?? ""
    );
  }

  function resetVisitorBabyStates() {
    setDemoBaby(null);
    setDemoBabyName("");
    setDemoBabyPrenom("");
    setDemoBabySexe("");
    setDemoBabyDateNaissance("");
    setDemoBabyPoidsActuel("");
    setDemoBabyParcours("");
    setBabyContext(null);
    setBabyInfo("votre bébé");
    setAvatarUrl(null);
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
      type_lait: baby.type_lait ?? null,
      intolerances: baby.intolerances ?? null,
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
        type_lait: (babyData.type_lait as TypeLait) ?? null,
        intolerances: (babyData.intolerances as Intolerance[]) ?? null,
      });
    }
  }

  async function loadAnonymousDemoData() {
    setIsAuthenticated(false);
    setBaby(null);
    setUserEmail(null);
    setUserScopeId("");

    const sessionId = getOrCreateSessionId();
    setDemoSessionId(sessionId);

    let loaded = false;

    if (hasLegacyBabyPrenom()) {
      const legacyBaby = loadLegacyBabyFromLocalStorage(sessionId);
      if (legacyBaby) {
        saveDemoBaby(legacyBaby);
        applyDemoBabyToUI(legacyBaby);
        loaded = true;
      } else {
        applyPartialLegacyBabyFromLocalStorage();
        loaded = true;
      }
    } else {
      resetVisitorBabyStates();
    }

    if (!loaded) {
      const storedBaby = getDemoBaby(sessionId);
      if (storedBaby) {
        applyDemoBabyToUI(storedBaby);
        loaded = true;
      }
    }

    if (loaded) {
      const saved = loadBabyAvatar();
      if (saved) setAvatarUrl(saved);
    }

    try {
      const demoEvents = await fetchDemoEvents(sessionId);
      setEvents(demoEvents);
    } catch (error) {
      console.error("Demo error:", error);
    }
  }

  async function loadAuthenticatedData(): Promise<AuthenticatedBaby | null> {
    try {
      const supabaseClient = createSupabaseClient();
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (!user) return null;

      clearDemoLocalStorageForAuthenticatedUser();
      resetVisitorBabyStates();
      setDemoSessionId("");

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Erreur profil:", profileError);
        return null;
      }

      if (!profile?.family_id) {
        console.error("Pas de family_id sur le profil");
        return null;
      }

      setIsAuthenticated(true);
      setUserEmail(user.email ?? null);
      setUserScopeId(user.id);
      setMyRole(profile.role ?? "");
      setMyPrenom(
        profile.prenom?.trim() ||
          (profile.role === "papa"
            ? profile.prenom_papa
            : profile.prenom_maman) ||
          profile.prenom_maman ||
          profile.prenom_papa ||
          ""
      );

      await supabaseClient
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", user.id);

      const { data: membresData } = await supabaseClient
        .from("profiles")
        .select("id, prenom, prenom_maman, prenom_papa, role, last_seen")
        .eq("family_id", profile.family_id);

      if (membresData) setFamilyMembers(membresData as FamilyMemberProfile[]);

      const { data: baby, error: babyError } = await supabaseClient
        .from("babies")
        .select("*")
        .eq("family_id", profile.family_id)
        .maybeSingle();

      if (babyError) {
        console.error("Erreur bébé:", babyError);
        return null;
      }

      if (!baby) {
        console.error("Bébé introuvable pour family_id:", profile.family_id);
        setBaby(null);
        return null;
      }

      setBaby(baby);
      applyAuthenticatedBabyToUI(baby);

      const savedMode =
        (baby.mode_nuit as ModeNuitState | null) ?? loadModeNuit(user.id);
      if (savedMode?.actif) {
        setModeNuit(true);
        setModeNuitData(savedMode);
        if (savedMode.coucher) setNuitCoucher(savedMode.coucher);
        saveModeNuit(user.id, savedMode);
      }

      const events = await fetchEventsByBabyId(baby.id);
      setEvents(events);

      return baby;
    } catch (err) {
      console.error("Erreur chargement:", err);
      return null;
    }
  }

  async function syncModeNuitToBaby(state: ModeNuitState | null) {
    if (!baby?.id) return;
    const supabaseClient = createSupabaseClient();
    const { error } = await supabaseClient
      .from("babies")
      .update({ mode_nuit: state })
      .eq("id", baby.id);
    if (error) console.error("Mode nuit sync error:", error);
  }

  function activateModeNuit(state: ModeNuitState) {
    const id = isAuthenticated ? userScopeId : demoSessionId;
    if (!id) return;
    saveModeNuit(id, state);
    setModeNuit(true);
    setModeNuitData(state);
    void syncModeNuitToBaby(state);
  }

  function deactivateModeNuit() {
    const id = isAuthenticated ? userScopeId : demoSessionId;
    if (!id) return;
    clearModeNuit(id);
    setModeNuit(false);
    setModeNuitData(null);
    void syncModeNuitToBaby(null);
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

  const showToast = useCallback(
    (
      message: string,
      options?: { duration?: number; backgroundColor?: string }
    ) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage(message);
      setToastBackgroundColor(options?.backgroundColor ?? "#4A3F5C");
      setToastKey((k) => k + 1);
      setToastVisible(true);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        setToastMessage(null);
      }, options?.duration ?? 3000);
    },
    []
  );

  useLayoutEffect(() => {
    const sessionId = getOrCreateSessionId();
    setDemoSessionId(sessionId);
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
        const supabaseClient = createSupabaseClient();
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (user) {
          await loadAuthenticatedData();
        } else {
          await loadAnonymousDemoData();
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

      if (baby?.id) {
        const data = await fetchEventsByBabyId(baby.id);
        setEvents(data);
      } else {
        const data = await fetchEventsFromDb(user.id);
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les événements");
    } finally {
      setLoading(false);
    }
  }, [baby?.id]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents();
    }
  }, [fetchEvents, isAuthenticated, baby?.id]);

  useEffect(() => {
    if (!isAuthenticated || !baby?.id || !userScopeId) return;

    const supabaseClient = createSupabaseClient();
    const currentUserId = userScopeId;

    const channel = supabaseClient
      .channel(`baby-events-${baby.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `baby_id=eq.${baby.id}`,
        },
        (payload) => {
          const newEvent = payload.new as BebebouEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [newEvent, ...prev];
          });

          if (newEvent.user_id && newEvent.user_id !== currentUserId) {
            const emoji = getEventEmoji(newEvent.type);
            const label = getEventLabel(newEvent);
            const membre = familyMembers.find((m) => m.id === newEvent.user_id);
            const roleInfo = getRoleLabel(membre?.role);
            const prenom = membre ? getMemberPrenom(membre) : "Quelqu'un";
            showToast(
              `${roleInfo.emoji} ${prenom} vient d'enregistrer ${label}`
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `baby_id=eq.${baby.id}`,
        },
        (payload) => {
          const updated = payload.new as BebebouEvent;
          setEvents((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "events",
          filter: `baby_id=eq.${baby.id}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId) return;
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [baby?.id, isAuthenticated, userScopeId, showToast, familyMembers]);

  useEffect(() => {
    if (!isAuthenticated || !baby?.id || !userScopeId) return;

    const supabaseClient = createSupabaseClient();
    const currentUserId = userScopeId;

    type PresencePayload = { user_id: string; online_at: string };

    const presenceChannel = supabaseClient
      .channel(`presence-${baby.id}`)
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<PresencePayload>();
        setOnlineUserIds(extractOnlineUserIds(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabaseClient.removeChannel(presenceChannel);
      setOnlineUserIds(new Set());
    };
  }, [baby?.id, isAuthenticated, userScopeId]);

  const scopeId = isAuthenticated ? userScopeId : demoSessionId;

  useEffect(() => {
    if (!scopeId) return;
    const saved = loadModeNuit(scopeId);
    if (saved?.actif) {
      setModeNuit(true);
      setModeNuitData(saved);
      if (saved.coucher) setNuitCoucher(saved.coucher);
    }
  }, [scopeId]);

  useLayoutEffect(() => {
    const savedSieste = loadSiesteActive();
    if (savedSieste?.actif && savedSieste.heure_debut) {
      setSiesteHeureDebut(new Date(savedSieste.heure_debut));
      setSiesteActive(true);
    }
  }, []);

  useEffect(() => {
    if (!siesteActive || !siesteHeureDebut) return;
    const interval = setInterval(() => setChronoTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [siesteActive, siesteHeureDebut]);

  useEffect(() => {
    if (!avatarMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        avatarMenuRef.current &&
        !avatarMenuRef.current.contains(event.target as Node)
      ) {
        setAvatarMenuOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [avatarMenuOpen]);

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
    if (isAuthenticated) {
      setDemoBannerMode(null);
      return;
    }

    function refreshDemoBanner() {
      if (!hasDemoSessionStarted()) {
        setDemoBannerMode(null);
        return;
      }
      setDemoRemainingHours(getDemoRemainingHours());
      setDemoBannerMode(isDemoSessionPast24h() ? "expired" : "active");
    }

    refreshDemoBanner();
    const interval = setInterval(refreshDemoBanner, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, demoSessionId, events.length]);

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
            getEventToastMessage(type, ctx, note, quantity),
          {
            duration: options?.toastDuration,
            backgroundColor: options?.toastBackgroundColor,
          }
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
      babyRecord = await loadAuthenticatedData();
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
            getEventToastMessage(eventType, babyContext, note, quantity),
          {
            duration: options?.toastDuration,
            backgroundColor: options?.toastBackgroundColor,
          }
        );
      }
    }

    setSaving(false);
  }

  function handleShareClick() {
    setShowSignupModal(true);
  }

  function openSommeilChoice() {
    setError(null);
    setActiveModal("sommeil_choice");
  }

  function openSommeilSiesteStart() {
    setSiesteHeureDebutInput(getCurrentTimeValue());
    setActiveModal("sommeil_sieste_start");
  }

  function handleLancerSieste() {
    const heureDebutTimestamp = combineDateAndTime(
      new Date(),
      siesteHeureDebutInput
    );
    const heureDebutISO = heureDebutTimestamp.toISOString();

    setSiesteHeureDebut(heureDebutTimestamp);
    setSiesteActive(true);
    saveSiesteActive({ actif: true, heure_debut: heureDebutISO });
    setActiveModal(null);
  }

  function openSommeilSiesteEnd() {
    if (!siesteActive || !siesteHeureDebut) return;
    setSiesteHeureFinInput(toTimeInputValue());
    setActiveModal("sommeil_sieste_end");
  }

  function closeSommeilSiesteEndModal() {
    if (saving) return;
    setActiveModal(null);
  }

  async function handleSiesteEnregistrer() {
    if (!siesteHeureDebut) return;

    const heureFinTimestamp = buildFinTimestampAfterStart(
      siesteHeureDebut,
      siesteHeureFinInput
    );
    const dureeMin = Math.max(
      1,
      Math.floor(
        (heureFinTimestamp.getTime() - siesteHeureDebut.getTime()) / 60000
      )
    );
    const meta: SommeilMeta = {
      heure_debut: toTimeInputValue(siesteHeureDebut),
      heure_fin: siesteHeureFinInput,
      duree_minutes: dureeMin,
    };
    const toastMsg = `😴 Sieste enregistrée — ${formatSiesteDurationShort(dureeMin)} ✅`;

    await addEvent("sieste", serializeNote(meta), dureeMin, {
      createdAt: siesteHeureDebut.toISOString(),
      customToast: toastMsg,
      toastDuration: 2000,
      toastBackgroundColor: "#4CAF50",
    });

    clearSiesteActive();
    setSiesteActive(false);
    setSiesteHeureDebut(null);
    setActiveModal(null);
  }

  function openSommeilNuitStart() {
    setNuitCoucher(toTimeInputValue());
    setNuitReveilsPrevus(0);
    setActiveModal("sommeil_nuit_start");
  }

  function handleBonneNuit() {
    const now = new Date();
    const state: ModeNuitState = {
      actif: true,
      heure_debut: now.toISOString(),
      coucher: nuitCoucher,
      nb_reveils_prevus: nuitReveilsPrevus,
    };
    activateModeNuit(state);
    saveNightBedtime(nuitCoucher);
    dismissNightBanner();
    setActiveModal(null);
    showToast("🌙 Bonne nuit !");
  }

  function openSommeilNuitWake() {
    setNuitLever(toTimeInputValue());
    setNuitReveilCount(modeNuitData?.nb_reveils_prevus ?? 0);
    setActiveModal("sommeil_nuit_wake");
  }

  function handleNuitWakeSubmit() {
    const prenom = babyContext?.prenom ?? demoBaby?.prenom;
    const dateNaissance = babyContext?.date_naissance ?? demoBaby?.date_naissance;
    if (!prenom || !modeNuitData) return;

    const coucher = modeNuitData.coucher ?? nuitCoucher;
    const durationMin = calcSleepMinutes(coucher, nuitLever);
    const meta: SommeilMeta = {
      heure_debut: coucher,
      heure_fin: nuitLever,
      nb_reveils: nuitReveilCount,
    };
    const leverDate = combineDateAndTime(new Date(), nuitLever);
    const analysis = getNightAnalysis(prenom, dateNaissance, {
      coucher,
      lever: nuitLever,
      reveils: [],
      totalReveils: nuitReveilCount,
    });

    deactivateModeNuit();
    setActiveModal(null);
    addEvent("nuit", serializeNote(meta), durationMin, {
      createdAt: leverDate.toISOString(),
      customToast: analysis,
    });
  }

  function handleSommeilTypeSelect(type: SleepFormType) {
    if (type === "sieste") {
      openSommeilSiesteStart();
      return;
    }
    setActiveModal(null);
    openSommeilNuitStart();
  }

  function openSommeilNuitForm() {
    openSommeilNuitStart();
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

  function openCoucheModal() {
    setCoucheHeure(getCurrentTimeValue());
    setCoucheType(null);
    setUrineCouleur("jaune_pale");
    setUrineQuantite("normale");
    setSelleCouleur("jaune_moutarde");
    setSelleConsistance("granuleuse");
    setSelleQuantite("normale");
    setSelleOdeur("normale");
    setSignesAssocies([]);
    setError(null);
    setActiveModal("couche");
  }

  function toggleSigneAssocie(id: string) {
    setSignesAssocies((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function handleCoucheSubmit() {
    if (!coucheType) {
      setError("Sélectionne un type de couche");
      return;
    }

    const meta: CoucheMeta = {
      type_couche: coucheType,
      ...(includesPipi(coucheType)
        ? { urine_couleur: urineCouleur, urine_quantite: urineQuantite }
        : {}),
      ...(includesSelle(coucheType)
        ? {
            selle_couleur: selleCouleur,
            selle_consistance: selleConsistance,
            selle_quantite: selleQuantite,
            selle_odeur: selleOdeur,
            signes_associes: signesAssocies,
          }
        : {}),
    };

    addEvent("couche", serializeNote(meta), undefined, {
      createdAt: buildCreatedAtFromTime(coucheHeure),
    });
  }

  function proceedWithCard(type: EventType) {
    switch (type) {
      case "biberon":
        openBiberonModal();
        break;
      case "couche":
        openCoucheModal();
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

  function openBabySetupForCard(type: EventType) {
    setPendingCardType(type);
    setBabySetupError(null);
    prefillBabySetupFromLocalStorage();
    setBabySetupStep(hasLegacyBabyPrenom() ? "details" : "prenom");
    setShowBabySetupModal(true);
  }

  function validateBabySetupPrenom(): string | null {
    if (!demoBabyPrenom.trim()) return "Le prénom du bébé est obligatoire.";
    return null;
  }

  function validateBabySetupDetails(): string | null {
    if (!demoBabySexe) return "Le sexe est obligatoire.";
    if (!demoBabyDateNaissance) return "La date de naissance est obligatoire.";
    const poidsActuel = parseFloat(demoBabyPoidsActuel.replace(",", "."));
    if (!demoBabyPoidsActuel || !poidsActuel || poidsActuel <= 0) {
      return "Le poids actuel est obligatoire (ex: 4.5).";
    }
    if (!demoBabyParcours) return "Le parcours d'alimentation est obligatoire.";
    return null;
  }

  function handleBabySetupPrenomContinue() {
    const validationError = validateBabySetupPrenom();
    if (validationError) {
      setBabySetupError(validationError);
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("baby_prenom", demoBabyPrenom.trim());
    }
    setBabySetupError(null);
    setBabySetupStep("details");
  }

  function handleBabySetupSubmit() {
    const prenomError = validateBabySetupPrenom();
    if (prenomError) {
      setBabySetupError(prenomError);
      setBabySetupStep("prenom");
      return;
    }
    const validationError = validateBabySetupDetails();
    if (validationError) {
      setBabySetupError(validationError);
      return;
    }

    const poidsActuel = parseFloat(demoBabyPoidsActuel.replace(",", "."));
    const sessionId = demoSessionId || getOrCreateSessionId();
    setDemoSessionId(sessionId);

    const baby: DemoBaby = {
      session_id: sessionId,
      prenom: demoBabyPrenom.trim(),
      sexe: demoBabySexe as DemoBabySexe,
      date_naissance: demoBabyDateNaissance,
      poids_naissance: poidsActuel,
      poids_actuel: poidsActuel,
      parcours: demoBabyParcours as DemoParcours,
    };

    computeDemoBabyMetrics(baby);
    saveDemoBaby(baby);
    saveWeightLocalStorage(poidsActuel, poidsActuel);
    applyDemoBabyToUI(baby);
    setShowBabySetupModal(false);
    setBabySetupError(null);
    setError(null);

    if (pendingCardType) {
      const type = pendingCardType;
      setPendingCardType(null);
      proceedWithCard(type);
    }
  }

  function handleSommeilClick() {
    if (saving) return;
    const sessionId = demoSessionId || getOrCreateSessionId();
    if (!isAuthenticated && !hasCompleteDemoProfile(sessionId)) {
      openBabySetupForCard("sieste");
      return;
    }
    openSommeilChoice();
  }

  function handleCardClick(type: EventType) {
    if (saving) return;
    const sessionId = demoSessionId || getOrCreateSessionId();
    if (!isAuthenticated && !hasCompleteDemoProfile(sessionId)) {
      openBabySetupForCard(type);
      return;
    }
    proceedWithCard(type);
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
    }
  }

  async function handleSignOut() {
    setAvatarMenuOpen(false);
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
    router.push("/login");
  }

  function handleOpenProfil() {
    setAvatarMenuOpen(false);
    router.push("/profil");
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
    if (!isAuthenticated) return false;
    void nightUiTick;
    return (
      isNightModeHour() &&
      !isNightBannerDismissed() &&
      Boolean(babyContext?.prenom)
    );
  }, [nightUiTick, babyContext, isAuthenticated]);

  const showMorningPrompt = useMemo(() => {
    if (!isAuthenticated) return false;
    void nightUiTick;
    return (
      isMorningPromptHour() &&
      !hasNightRecordedToday(events) &&
      Boolean(babyContext?.prenom)
    );
  }, [nightUiTick, events, babyContext, isAuthenticated]);

  const siesteChronometer = useMemo(() => {
    void chronoTick;
    if (!siesteActive || !siesteHeureDebut) return null;
    return formatChronometer(siesteHeureDebut.toISOString());
  }, [siesteActive, siesteHeureDebut, chronoTick]);

  const siesteEndDurationMin = useMemo(() => {
    if (!siesteHeureDebut) return 0;
    const finTs = buildFinTimestampAfterStart(
      siesteHeureDebut,
      siesteHeureFinInput
    );
    return Math.max(
      1,
      Math.floor((finTs.getTime() - siesteHeureDebut.getTime()) / 60000)
    );
  }, [siesteHeureDebut, siesteHeureFinInput]);

  const sommeilSexe = babyContext?.sexe ?? demoBaby?.sexe ?? null;
  const siesteCommenceLabel =
    sommeilSexe === "garcon"
      ? "À quelle heure a-t-il commencé ?"
      : "À quelle heure a-t-elle commencé ?";
  const siesteReveilLabel =
    sommeilSexe === "garcon"
      ? "À quelle heure s'est-il réveillé ?"
      : "À quelle heure s'est-elle réveillée ?";

  const sommeilPrenom = babyContext?.prenom ?? demoBabyName ?? "bébé";
  const showPersonalData =
    isAuthenticated || Boolean(babyContext?.prenom || demoBaby?.prenom);
  const feedingProfile = getFeedingProfile();

  const coucheModalAlerts = useMemo(
    () =>
      getCoucheModalAlerts(
        coucheType,
        {
          urine_couleur: urineCouleur,
          urine_quantite: urineQuantite,
          selle_couleur: selleCouleur,
          selle_consistance: selleConsistance,
          selle_quantite: selleQuantite,
          selle_odeur: selleOdeur,
          signes_associes: signesAssocies,
        },
        showPersonalData ? sommeilPrenom : "votre bébé"
      ),
    [
      coucheType,
      urineCouleur,
      urineQuantite,
      selleCouleur,
      selleConsistance,
      selleQuantite,
      selleOdeur,
      signesAssocies,
      sommeilPrenom,
      showPersonalData,
    ]
  );

  const coucheDashboardAlerts = useMemo(() => {
    if (!isAuthenticated) return [];
    if (!feedingProfile?.prenom) return [];
    return getCoucheDashboardAlerts(
      events,
      feedingProfile.prenom,
      (feedingProfile.type_lait as TypeLait) ?? null,
      (feedingProfile.intolerances as Intolerance[]) ?? null
    );
  }, [events, feedingProfile, isAuthenticated]);

  const biberonAlert = useMemo(() => {
    if (!isAuthenticated) return null;
    void biberonTick;
    if (modeNuit) return null;
    if (!feedingProfile?.prenom || !feedingProfile.date_naissance) return null;
    return getBiberonAlertState({
      dernierBiberon: lastBiberon ?? null,
      prenom: feedingProfile.prenom,
      sexe: feedingProfile.sexe,
      ageEnJours: getAgeInDays(feedingProfile.date_naissance),
      parcours: feedingProfile.parcours ?? "artificiel",
    });
  }, [biberonTick, lastBiberon, feedingProfile, modeNuit, isAuthenticated]);

  const nightModeBiberonMessage = useMemo(() => {
    if (!isAuthenticated) return null;
    if (!modeNuit || !feedingProfile?.prenom) return null;
    return getNightModeBiberonMessage(
      feedingProfile.prenom,
      feedingProfile.sexe
    );
  }, [modeNuit, feedingProfile, isAuthenticated]);

  const lastSleepEvent = useMemo(
    () => events.find((e) => e.type === "sieste" || e.type === "nuit") ?? null,
    [events]
  );

  const sommeilSubtitle = useMemo(() => {
    if (!showPersonalData) return "Aucun enregistrement";
    if (!lastSleepEvent) return "Aucun enregistrement";
    return getCardSubtitle(lastSleepEvent.type, events);
  }, [lastSleepEvent, events, showPersonalData]);

  function getDashboardCardSubtitle(type: EventType) {
    if (!showPersonalData) return "Aucun enregistrement";
    return getCardSubtitle(type, events);
  }

  const recommendedMl = feedingProfile?.date_naissance
    ? getBiberonRecommandation(getAgeInDays(feedingProfile.date_naissance)).ml
    : 120;

  const biberonInverseTimer = useMemo(() => {
    if (modeNuit) return null;
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
  }, [biberonTick, biberonAlert, lastBiberon, feedingProfile, modeNuit]);

  const biberonMlValue = Math.min(
    350,
    Math.max(10, parseInt(biberonMl, 10) || recommendedMl)
  );

  function adjustBiberonMl(delta: number) {
    setBiberonMlEdited(true);
    setBiberonMl(String(Math.min(350, Math.max(10, biberonMlValue + delta))));
  }

  const biberonFeedback = useMemo(() => {
    if (!showPersonalData) return null;
    if (biberonInputMode !== "ml" || !biberonMlEdited) return null;
    const qty = parseInt(biberonMl, 10);
    if (!feedingProfile?.prenom) return null;
    return getBiberonQuantityFeedback(qty, recommendedMl, feedingProfile.prenom);
  }, [
    showPersonalData,
    biberonInputMode,
    biberonMl,
    biberonMlEdited,
    recommendedMl,
    feedingProfile?.prenom,
  ]);

  if (!skeletonRevealed) {
    return <HomeSkeleton />;
  }

  const showHeaderBaby =
    isAuthenticated ||
    (!isAuthenticated && Boolean(demoBaby?.prenom || babyContext?.prenom));

  const displayBabyInfo =
    showHeaderBaby || showPersonalData ? babyInfo : "votre bébé";
  const displayBabyName = showPersonalData ? sommeilPrenom : "votre bébé";

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
            ref={avatarMenuRef}
            className="absolute right-4 top-8"
            style={{ zIndex: 102 }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAvatarMenuOpen((open) => !open);
              }}
              aria-label="Menu compte"
              aria-expanded={avatarMenuOpen}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                borderRadius: "50%",
              }}
            >
              <BabyAvatar
                prenom={babyContext?.prenom ?? demoBabyName ?? "?"}
                photoUrl={avatarUrl}
                size={48}
              />
            </button>

            {avatarMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 60,
                  right: 0,
                  backgroundColor: "white",
                  borderRadius: 20,
                  padding: 20,
                  boxShadow: "0 8px 32px rgba(74,63,92,0.15)",
                  zIndex: 100,
                  minWidth: 220,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#4A3F5C",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(() => {
                    const roleInfo = getRoleLabel(myRole);
                    const displayName = myPrenom || userEmail?.split("@")[0] || "Moi";
                    return `${roleInfo.emoji} ${displayName} · ${roleInfo.label}`;
                  })()}
                </p>

                {familyMembers.filter((m) => m.id !== userScopeId).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {familyMembers
                      .filter((m) => m.id !== userScopeId)
                      .map((membre) => {
                        const roleInfo = getRoleLabel(membre.role);
                        const prenom = getMemberPrenom(membre);
                        const isOnline = onlineUserIds.has(membre.id);
                        return (
                          <div
                            key={membre.id}
                            style={{
                              fontSize: 13,
                              color: "#8B7FA0",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            <span>{roleInfo.emoji}</span>
                            <span>{prenom}</span>
                            <span>{isOnline ? "🟢" : "⚫"}</span>
                          </div>
                        );
                      })}
                  </div>
                )}

                <div
                  style={{
                    height: 1,
                    backgroundColor: "#F0E8F8",
                    margin: "12px 0",
                  }}
                />

                <button
                  type="button"
                  onClick={handleOpenProfil}
                  style={{
                    display: "block",
                    width: "100%",
                    background: "none",
                    border: "none",
                    fontSize: 14,
                    color: "#4A3F5C",
                    padding: "10px 0",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  👤 Mon profil
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    display: "block",
                    width: "100%",
                    background: "none",
                    border: "none",
                    fontSize: 14,
                    color: "#E8406A",
                    padding: "10px 0",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  🚪 Se déconnecter
                </button>
              </div>
            )}
          </div>
        )}
        {!isAuthenticated && showHeaderBaby && (
          <div
            className="absolute right-4 top-8"
            style={{
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#4A3F5C",
              }}
            >
              {babyContext?.prenom ?? demoBabyName}
            </span>
            <button
              type="button"
              onClick={handleOpenProfil}
              aria-label="Mon profil"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                borderRadius: "50%",
              }}
            >
              <BabyAvatar
                prenom={babyContext?.prenom ?? demoBabyName ?? "?"}
                photoUrl={avatarUrl}
                size={48}
              />
            </button>
          </div>
        )}
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

      {isAuthenticated &&
        coucheDashboardAlerts.map((alert) => (
        <div
          key={alert.message}
          style={{
            maxWidth: 448,
            margin: "0 auto 12px",
            padding: "0 16px",
          }}
        >
          <div
            style={{
              backgroundColor:
                alert.severity === "red" ? "#FF6B6B" : "#F5A623",
              color: "white",
              borderRadius: 16,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
              boxShadow: "0 4px 16px rgba(74,63,92,0.12)",
            }}
          >
            {alert.message}
          </div>
        </div>
      ))}

      {isAuthenticated && showMorningPrompt && babyContext && (
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
              Tout va bien ✅ · {displayBabyInfo}
            </p>
          )}
        </motion.section>

        {isAuthenticated && (
        <AnimatePresence>
          {!modeNuit && biberonAlert && !biberonAlert.bandeauCouleur && (
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
        )}

        {isAuthenticated && (modeNuit && nightModeBiberonMessage ? (
          <motion.section
            animate={{ backgroundColor: "#6B5B95" }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl px-4 py-3 shadow-md"
          >
            <p className="text-sm leading-relaxed text-white">
              {nightModeBiberonMessage}
            </p>
          </motion.section>
        ) : biberonAlert?.bandeauCouleur ? (
          <motion.section
            animate={{ backgroundColor: biberonAlert.bandeauCouleur }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl px-4 py-3 shadow-md"
          >
            <p className="text-sm leading-relaxed text-[#4A3F5C]">
              {biberonAlert.message}
            </p>
          </motion.section>
        ) : null)}

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
                  : getDashboardCardSubtitle("biberon")}
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
              {saving ? "Enregistrement..." : getDashboardCardSubtitle("couche")}
            </p>
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl p-5 text-center shadow-md"
            style={{ backgroundColor: "#EEE8FF" }}
          >
            {siesteActive ? (
              <>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#4A3F5C",
                    margin: 0,
                  }}
                >
                  😴 Sieste en cours — {siesteChronometer}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSommeilSiesteEnd();
                  }}
                  disabled={saving}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    backgroundColor: "#9B59B6",
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
                  ⏹ Terminer la sieste
                </button>
              </>
            ) : modeNuit && isAuthenticated ? (
              <>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#4A3F5C",
                    margin: 0,
                  }}
                >
                  🌙 {sommeilPrenom} est en mode nuit
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSommeilNuitWake();
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
                  ☀️ Enregistrer le réveil
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSommeilClick}
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
                <p style={{ fontSize: 36, margin: 0 }}>😴</p>
                <p
                  style={{
                    marginTop: 8,
                    fontWeight: 700,
                    color: "#4A3F5C",
                  }}
                >
                  Sommeil
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#8B7FA0",
                  }}
                >
                  {saving ? "Enregistrement..." : sommeilSubtitle}
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
              {saving ? "Enregistrement..." : getDashboardCardSubtitle("pleure")}
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

          {!showPersonalData || todayEvents.length === 0 ? (
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

        {!isAuthenticated && (
          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              color: "#8B7FA0",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              marginTop: 8,
            }}
          >
            🔄 Réinitialiser la session
          </button>
        )}
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
                {(showPersonalData
                  ? feedingProfile?.prenom && feedingProfile.date_naissance
                  : true) && (
                    <p
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: "#8B7FA0",
                        textAlign: "center",
                      }}
                    >
                      {showPersonalData && feedingProfile?.prenom && feedingProfile.date_naissance
                        ? (() => {
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
                          })()
                        : "Recommandé pour votre bébé"}
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
                {showPersonalData &&
                  feedingProfile?.prenom &&
                  feedingProfile.date_naissance && (
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

      <ModalSheet open={activeModal === "couche"} onClose={closeModal} centered>
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          🌿 Couche de {displayBabyName}
        </h2>

        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4A3F5C", marginBottom: 6 }}>
          Heure du change
        </label>
        <input
          type="time"
          value={coucheHeure}
          onChange={(e) => setCoucheHeure(e.target.value)}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "14px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 18,
            textAlign: "center",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
            marginBottom: 20,
          }}
        />

        <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Type</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {COUCHE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCoucheType(opt.id)}
              style={{
                flex: 1,
                borderRadius: 12,
                padding: "12px 8px",
                fontSize: 13,
                fontWeight: 600,
                border: coucheType === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                backgroundColor: coucheType === opt.id ? "#E8406A" : "white",
                color: coucheType === opt.id ? "white" : "#4A3F5C",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {coucheType && includesPipi(coucheType) && (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Couleur urine</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {URINE_COULEUR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUrineCouleur(opt.id)}
                  style={{
                    borderRadius: 12,
                    padding: "10px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: urineCouleur === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: urineCouleur === opt.id ? "#E8406A" : "white",
                    color: urineCouleur === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <span style={{ display: "block", fontSize: 18 }}>{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Quantité</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {URINE_QUANTITE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUrineQuantite(opt.id)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    padding: "10px 8px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: urineQuantite === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: urineQuantite === opt.id ? "#E8406A" : "white",
                    color: urineQuantite === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {coucheType && includesSelle(coucheType) && (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Couleur selles</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {SELLE_COULEUR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelleCouleur(opt.id)}
                  style={{
                    borderRadius: 12,
                    padding: "10px 6px",
                    fontSize: 10,
                    fontWeight: 600,
                    border: selleCouleur === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: selleCouleur === opt.id ? "#E8406A" : "white",
                    color: selleCouleur === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <span style={{ display: "block", fontSize: 18 }}>{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Consistance</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
              {SELLE_CONSISTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelleConsistance(opt.id)}
                  style={{
                    borderRadius: 12,
                    padding: "10px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: selleConsistance === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: selleConsistance === opt.id ? "#E8406A" : "white",
                    color: selleConsistance === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Quantité</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {SELLE_QUANTITE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelleQuantite(opt.id)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    padding: "10px 8px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: selleQuantite === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: selleQuantite === opt.id ? "#E8406A" : "white",
                    color: selleQuantite === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Odeur</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {SELLE_ODEUR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelleOdeur(opt.id)}
                  style={{
                    flex: 1,
                    minWidth: 90,
                    borderRadius: 12,
                    padding: "10px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: selleOdeur === opt.id ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                    backgroundColor: selleOdeur === opt.id ? "#E8406A" : "white",
                    color: selleOdeur === opt.id ? "white" : "#4A3F5C",
                    cursor: "pointer",
                  }}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>Signes associés</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {SIGNES_ASSOCIES_OPTIONS.map((opt) => {
                const checked = signesAssocies.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleSigneAssocie(opt.id)}
                    style={{
                      borderRadius: 12,
                      padding: "8px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      border: checked ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                      backgroundColor: checked ? "#FFF0F5" : "white",
                      color: "#4A3F5C",
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {coucheModalAlerts.map((alert) => (
          <div
            key={alert.message}
            style={{
              backgroundColor: alert.severity === "red" ? "#FF6B6B" : "#F5A623",
              color: "white",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {alert.message}
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
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
            onClick={handleCoucheSubmit}
            disabled={saving || !coucheType}
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
              opacity: saving || !coucheType ? 0.6 : 1,
            }}
          >
            Enregistrer ✓
          </button>
        </div>
      </ModalSheet>

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
              {babySetupStep === "prenom"
                ? "Comment s'appelle votre bébé ?"
                : "C'est pour qui ? 🍼"}
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

            {babySetupStep === "prenom" ? (
              <>
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
                <button
                  type="button"
                  onClick={handleBabySetupPrenomContinue}
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
                    cursor: "pointer",
                  }}
                >
                  Continuer →
                </button>
              </>
            ) : (
              <>
                <p
                  style={{
                    fontSize: 14,
                    color: "#8B7FA0",
                    margin: "8px 0 0",
                    textAlign: "center",
                  }}
                >
                  Pour {demoBabyPrenom.trim()} — quelques infos pour personnaliser
                </p>

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
                  Sexe
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      ["fille", "👧 Fille"],
                      ["garcon", "👦 Garçon"],
                    ] as [DemoBabySexe, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setDemoBabySexe(value);
                        setBabySetupError(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border:
                          demoBabySexe === value
                            ? "1.5px solid #E8406A"
                            : "1.5px solid #F0E8F8",
                        backgroundColor:
                          demoBabySexe === value ? "#E8406A" : "white",
                        color: demoBabySexe === value ? "white" : "#4A3F5C",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
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
                  Poids actuel en kg
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
                        color:
                          demoBabyParcours === value ? "white" : "#4A3F5C",
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
                    cursor: "pointer",
                  }}
                >
                  C&apos;est parti ! →
                </button>
              </>
            )}
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
              border: "2px solid transparent",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 40, display: "block" }}>😴</span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "#4A3F5C", marginTop: 8 }}>Sieste</span>
            <span style={{ display: "block", fontSize: 12, color: "#8B7FA0", marginTop: 4 }}>Repos de la journée</span>
          </button>
          <button
            type="button"
            onClick={() => handleSommeilTypeSelect("nuit")}
            style={{
              flex: 1,
              backgroundColor: "#E8F4FF",
              borderRadius: 20,
              padding: 24,
              border: "2px solid transparent",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 40, display: "block" }}>🌙</span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "#4A3F5C", marginTop: 8 }}>Nuit</span>
            <span style={{ display: "block", fontSize: 12, color: "#8B7FA0", marginTop: 4 }}>Sommeil nocturne</span>
          </button>
        </div>
      </ModalSheet>

      <ModalSheet open={activeModal === "sommeil_sieste_start"} onClose={closeModal} centered>
        <h2
          style={{
            margin: 0,
            marginBottom: 8,
            fontSize: 18,
            fontWeight: 700,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          😴 Sieste de {displayBabyName}
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 14,
            color: "#8B7FA0",
            textAlign: "center",
          }}
        >
          {siesteCommenceLabel}
        </p>
        <input
          type="time"
          value={siesteHeureDebutInput}
          onChange={(e) => setSiesteHeureDebutInput(e.target.value)}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "14px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 18,
            textAlign: "center",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
            marginBottom: 24,
          }}
        />
        <div style={{ display: "flex", gap: 12 }}>
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
            onClick={handleLancerSieste}
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
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            Lancer la sieste ▶️
          </button>
        </div>
      </ModalSheet>

      <ModalSheet
        open={activeModal === "sommeil_sieste_end"}
        onClose={closeSommeilSiesteEndModal}
        centered
      >
        <h2
          style={{
            margin: 0,
            marginBottom: 8,
            fontSize: 18,
            fontWeight: 700,
            color: "#4A3F5C",
            textAlign: "center",
          }}
        >
          ☀️ Réveil de {displayBabyName}
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 14,
            color: "#8B7FA0",
            textAlign: "center",
          }}
        >
          {siesteReveilLabel}
        </p>
        <input
          type="time"
          value={siesteHeureFinInput}
          onChange={(e) => setSiesteHeureFinInput(e.target.value)}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "14px 16px",
            border: "1.5px solid #F0E8F5",
            fontSize: 18,
            textAlign: "center",
            backgroundColor: "#FDF8F2",
            boxSizing: "border-box",
            marginBottom: 12,
          }}
        />
        <p
          style={{
            fontSize: 14,
            color: "#8B7FA0",
            textAlign: "center",
            margin: "0 0 24px",
          }}
        >
          Durée : {formatSiesteDurationShort(siesteEndDurationMin)}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={closeSommeilSiesteEndModal}
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
            onClick={handleSiesteEnregistrer}
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
      </ModalSheet>

      <ModalSheet open={activeModal === "sommeil_nuit_start"} onClose={closeModal} centered>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#4A3F5C", textAlign: "center" }}>
          🌙 Bonne nuit pour {displayBabyName}
        </h2>
        <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>Heure coucher</label>
        <input
          type="time"
          value={nuitCoucher}
          onChange={(e) => setNuitCoucher(e.target.value)}
          style={{ marginTop: 6, marginBottom: 16, width: "100%", borderRadius: 12, border: "1.5px solid #F0E8F5", padding: "12px 16px", fontSize: 16, backgroundColor: "#FDF8F2", boxSizing: "border-box" }}
        />
        <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>Réveils prévus (optionnel)</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {SOMMEIL_REVEIL_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNuitReveilsPrevus(n)}
              style={{
                flex: "1 1 14%",
                minWidth: 44,
                borderRadius: 12,
                padding: "10px 6px",
                fontSize: 13,
                fontWeight: 600,
                border: nuitReveilsPrevus === n ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                backgroundColor: nuitReveilsPrevus === n ? "#E8406A" : "white",
                color: nuitReveilsPrevus === n ? "white" : "#4A3F5C",
                cursor: "pointer",
              }}
            >
              {n === 5 ? "5+" : n}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleBonneNuit}
          disabled={saving}
          style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", backgroundColor: "#3498DB", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
        >
          Bonne nuit 🌙
        </button>
        <button type="button" onClick={closeModal} disabled={saving} className="mt-3 w-full rounded-2xl bg-gray-100 py-3 text-sm text-[#8B7FA0]">
          Annuler
        </button>
      </ModalSheet>

      <ModalSheet open={activeModal === "sommeil_nuit_wake"} onClose={closeModal} centered>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#4A3F5C", textAlign: "center" }}>
          ☀️ Réveil de {displayBabyName}
        </h2>
        <label style={{ display: "block", fontSize: 13, color: "#8B7FA0" }}>Heure de réveil</label>
        <input
          type="time"
          value={nuitLever}
          onChange={(e) => setNuitLever(e.target.value)}
          style={{ marginTop: 6, marginBottom: 16, width: "100%", borderRadius: 12, border: "1.5px solid #F0E8F5", padding: "12px 16px", fontSize: 16, backgroundColor: "#FDF8F2", boxSizing: "border-box" }}
        />
        <p style={{ fontSize: 13, color: "#8B7FA0", margin: "0 0 8px" }}>Réveils cette nuit</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
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
                border: nuitReveilCount === n ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                backgroundColor: nuitReveilCount === n ? "#E8406A" : "white",
                color: nuitReveilCount === n ? "white" : "#4A3F5C",
                cursor: "pointer",
              }}
            >
              {n === 5 ? "5+" : n}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 14, color: "#8B7FA0", textAlign: "center", marginBottom: 20 }}>
          Durée : {formatDurationCompact(calcSleepMinutes(modeNuitData?.coucher ?? nuitCoucher, nuitLever))}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={closeModal} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 14, border: "1.5px solid #F0E8F8", backgroundColor: "white", color: "#4A3F5C", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Annuler
          </button>
          <button type="button" onClick={handleNuitWakeSubmit} disabled={saving} style={{ flex: 1, padding: 14, borderRadius: 14, border: "none", backgroundColor: "#E8406A", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            Enregistrer ✓
          </button>
        </div>
      </ModalSheet>

      <AnimatePresence>
        {toastVisible && toastMessage && (
          <motion.div
            key={toastKey}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
              position: "fixed",
              top: 70,
              left: 16,
              right: 16,
              backgroundColor: toastBackgroundColor,
              color: "white",
              borderRadius: 16,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
              zIndex: 1000,
              boxShadow: "0 8px 24px rgba(74,63,92,0.25)",
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <ModalSheet open={activeModal === "pleure"} onClose={closeModal} centered>
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

      {!isAuthenticated && demoBannerMode === "active" && (
        <div
          style={{
            position: "fixed",
            bottom: 72,
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: "#4A3F5C",
            color: "white",
            fontSize: 12,
            padding: "8px 16px",
            textAlign: "center",
          }}
        >
          ⏱ Mode démo — {demoRemainingHours}h restantes ·{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: 12,
            }}
          >
            Créer un compte →
          </button>
        </div>
      )}

      {!isAuthenticated && demoBannerMode === "expired" && (
        <div
          style={{
            position: "fixed",
            bottom: 72,
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: "#FFF0F5",
            borderTop: "1px solid #F0E8F5",
            padding: "12px 16px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "#4A3F5C",
              fontWeight: 600,
            }}
          >
            Votre démo a expiré — créez un compte pour continuer
          </p>
          <button
            type="button"
            onClick={() => router.push("/register")}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "10px 20px",
              backgroundColor: "#E8406A",
              color: "white",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Créer un compte
          </button>
        </div>
      )}
    </main>
  );
}
