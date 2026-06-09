"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { fetchEventsByBabyId } from "@/lib/events";
import {
  type FamilyMemberProfile,
  extractOnlineUserIds,
  formatLastSeen,
  generateInviteCodeFromFamilyId,
  getMemberPrenom,
} from "@/lib/family";
import { getRoleLabel } from "@/lib/roles";
import {
  getDefaultUserSettings,
  loadSettingsFromLocalStorage,
  loadUserSettings,
  mergeUserSettings,
  saveUserSetting,
  type UserSettings,
} from "@/lib/user-settings";

let VAPID_KEY =
  "BBn5ndMgtpf-O8JsGqY0X2qy01UilKtfCrbajxN4PN4RNfaPeHkiZxz4aYxR-BF1Wi0Ldqv0XJoygSUsTiNGQ58";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const sectionCard = {
  backgroundColor: "white",
  borderRadius: 20,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 2px 12px rgba(74,63,92,0.06)",
} as const;

const sectionTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#8B7FA0",
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  marginBottom: 16,
  marginTop: 0,
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 99,
        border: "none",
        backgroundColor: checked ? "#E8406A" : "#E5E5EA",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        transition: "background-color 0.2s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 0,
          width: 27,
          height: 27,
          borderRadius: "50%",
          backgroundColor: "white",
          transform: checked ? "translateX(22px)" : "translateX(2px)",
          transition: "transform 0.2s ease",
          boxShadow: "0 1px 4px rgba(74,63,92,0.2)",
        }}
      />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
  border = true,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  border?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 0",
        borderBottom: border ? "1px solid #F0E8F5" : "none",
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4A3F5C" }}>
          {label}
        </p>
        {description && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8B7FA0" }}>
            {description}
          </p>
        )}
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "8px 14px",
              borderRadius: 20,
              border: active ? "none" : "1.5px solid #F0E8F5",
              backgroundColor: active ? "#E8406A" : "white",
              color: active ? "white" : "#8B7FA0",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ReglagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(getDefaultUserSettings());
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [monRole, setMonRole] = useState("");
  const [monPrenomUser, setMonPrenomUser] = useState("");
  const [membres, setMembres] = useState<FamilyMemberProfile[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const [deleteStep, setDeleteStep] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "—";

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const applySettings = useCallback((data: UserSettings) => {
    setSettings(mergeUserSettings(getDefaultUserSettings(), data));
  }, []);

  const persist = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!userId) return;
      const supabase = createSupabaseClient();
      const updated = await saveUserSetting(
        supabase,
        userId,
        babyId,
        key,
        value,
        settings
      );
      setSettings(updated);
    },
    [userId, babyId, settings]
  );

  const saveSettings = useCallback(
    async (key: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
      await persist(key, value);
    },
    [persist]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifDenied(Notification.permission === "denied");
    }
  }, []);

  useEffect(() => {
    const checkNotifStatus = async () => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;
      if (!userId || !babyId) return;

      setNotifDenied(Notification.permission === "denied");

      if (Notification.permission === "granted") {
        if ("serviceWorker" in navigator) {
          console.log("VAPID key:", VAPID_KEY);
          console.log("SW ready:", "serviceWorker" in navigator);
          console.log("PushManager:", "PushManager" in window);
          console.log("Notification permission:", Notification.permission);

          await navigator.serviceWorker.register("/sw.js");
          const reg = await navigator.serviceWorker.ready;
          console.log("Registration:", reg);
          const sub = await reg.pushManager.getSubscription();
          console.log("Existing subscription:", sub);

          if (sub) {
            setNotifEnabled(true);
            await saveSettings("notif_enabled", true); saveSettingsToLocalStorage({...loadSettingsFromLocalStorage(), notif_enabled: true})
          } else {
            try {
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || VAPID_KEY),
              });
              console.log("New subscription:", newSub);
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subscription: newSub.toJSON(),
                  baby_id: babyId,
                  user_id: userId,
                }),
              });
              setNotifEnabled(true);
              await saveSettings("notif_enabled", true);
            } catch (err) {
              console.error("Subscribe failed:", err);
              setNotifEnabled(false);
            }
          }
        }
      } else {
        setNotifEnabled(false);
      }
    };

    void checkNotifStatus();
  }, [userId, babyId]);

  useEffect(() => {
    const local = loadSettingsFromLocalStorage();
    if (local) applySettings(local);
  }, [applySettings]);

  useEffect(() => {
    async function init() {
      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      let resolvedBabyId: string | null = null;
      if (profile?.family_id) {
        setFamilyId(profile.family_id);
        setMonRole(profile.role ?? "");
        setMonPrenomUser(
          profile.prenom?.trim() ||
            profile.prenom_maman ||
            profile.prenom_papa ||
            ""
        );

        const expectedInviteCode = generateInviteCodeFromFamilyId(
          profile.family_id
        );
        const { data: familyRow } = await supabase
          .from("families")
          .select("invite_code")
          .eq("id", profile.family_id)
          .maybeSingle();

        if (familyRow?.invite_code === expectedInviteCode) {
          setInviteCode(familyRow.invite_code);
        } else {
          const { data: updated } = await supabase
            .from("families")
            .update({ invite_code: expectedInviteCode })
            .eq("id", profile.family_id)
            .select("invite_code")
            .maybeSingle();
          setInviteCode(updated?.invite_code ?? expectedInviteCode);
        }

        const { data: membresData } = await supabase
          .from("profiles")
          .select("id, prenom, prenom_maman, prenom_papa, role, last_seen")
          .eq("family_id", profile.family_id);
        if (membresData) setMembres(membresData as FamilyMemberProfile[]);

        const { data: baby } = await supabase
          .from("babies")
          .select("id")
          .eq("family_id", profile.family_id)
          .maybeSingle();
        resolvedBabyId = baby?.id ?? null;
        setBabyId(resolvedBabyId);
      }

      const loaded = await loadUserSettings(supabase, user.id);
      applySettings({ ...loaded, baby_id: resolvedBabyId });
      setLoading(false);
    }

    void init();
  }, [router, applySettings]);

  useEffect(() => {
    if (!familyId || !userId) return;
    const supabase = createSupabaseClient();
    type PresencePayload = { user_id: string; online_at: string };

    const channel = supabase
      .channel(`family-presence-reglages-${familyId}`)
      .on("presence", { event: "sync" }, () => {
        setOnlineUserIds(extractOnlineUserIds(channel.presenceState<PresencePayload>()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, userId]);

  async function toggleNotifications() {
    if (typeof window === "undefined") return;

    const isPWA = window.matchMedia("(display-mode: standalone)").matches;

    if (!isPWA) {
      alert(
        "Ouvre les Réglages depuis l'icône Bébébou sur ton écran d'accueil"
      );
      return;
    }

    if (!("Notification" in window) || !("PushManager" in window)) {
      alert("Les notifications push ne sont pas supportées sur cet appareil");
      return;
    }

    if (!userId) return;

    if (notifEnabled) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      setNotifEnabled(false);
      await saveSettings("notif_enabled", false); saveSettingsToLocalStorage({...loadSettingsFromLocalStorage(), notif_enabled: false})
      return;
    }

    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    setNotifDenied(perm === "denied");

    if (perm !== "granted") {
      alert(
        "Active les notifications dans Réglages iOS → Notifications → Bébébou"
      );
      return;
    }

    if (!babyId) {
      alert("Profil bébé introuvable");
      return;
    }

    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || VAPID_KEY),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          baby_id: babyId,
          user_id: userId,
        }),
      });

      if (res.ok) {
        setNotifEnabled(true);
        await saveSettings("notif_enabled", true);
        alert("✅ Rappels biberon activés !");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Erreur: " + message);
    }
  }

  async function handleExportData() {
    if (!babyId) return;
    setExporting(true);
    try {
      const events = await fetchEventsByBabyId(babyId);
      const blob = new Blob([JSON.stringify(events, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bebebou-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Export téléchargé ✅");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAllData() {
    if (deleteStep === 0) {
      setDeleteStep(1);
      return;
    }
    if (!babyId) return;
    const supabase = createSupabaseClient();
    const { error } = await supabase.from("events").delete().eq("baby_id", babyId);
    if (error) {
      showToast("Erreur lors de la suppression");
      setDeleteStep(0);
      return;
    }
    showToast("Données supprimées");
    setDeleteStep(0);
  }

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleCopyInvite() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      showToast("Impossible de copier");
    }
  }

  if (loading) {
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
        <p style={{ color: "#8B7FA0", fontSize: 14 }}>Chargement...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#4A3F5C",
            color: "white",
            borderRadius: 20,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => router.push("/profil")}
          style={{
            background: "none",
            border: "none",
            color: "#8B7FA0",
            fontSize: 14,
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Retour
        </button>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
            margin: "0 0 24px",
          }}
        >
          ⚙️ Réglages
        </h1>

        {/* SECTION 1 — Notifications */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>🔔 Notifications</h2>

          <ToggleRow
            label="Rappels biberon"
            checked={notifEnabled}
            disabled={pushLoading}
            onChange={() => void toggleNotifications()}
          />

          {notifDenied && (
            <p style={{ fontSize: 12, color: "#E8406A", margin: "8px 0 0" }}>
              Notifications bloquées — activez-les dans Réglages iOS
            </p>
          )}

          {notifEnabled && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "8px 0 0" }}>
                Délai rappel biberon
              </p>
              <ChipGroup
                options={[
                  { label: "10 min", value: 10 },
                  { label: "15 min", value: 15 },
                  { label: "20 min", value: 20 },
                  { label: "30 min", value: 30 },
                ]}
                value={settings.notif_delay_minutes ?? 15}
                onChange={(v) => void persist("notif_delay_minutes", v)}
              />
            </>
          )}

          <ToggleRow
            label="Alertes couche"
            description="Alerte si aucune couche depuis X heures"
            checked={settings.couche_alert_enabled !== false}
            onChange={(v) => void persist("couche_alert_enabled", v)}
          />
          {settings.couche_alert_enabled !== false && (
            <ChipGroup
              options={[
                { label: "3h", value: 3 },
                { label: "4h", value: 4 },
                { label: "5h", value: 5 },
                { label: "6h", value: 6 },
              ]}
              value={settings.couche_alert_hours ?? 4}
              onChange={(v) => void persist("couche_alert_hours", v)}
            />
          )}

          <ToggleRow
            label="Notifications co-parent"
            description="Toast quand un co-parent enregistre un événement"
            checked={settings.coparent_notif !== false}
            onChange={(v) => void persist("coparent_notif", v)}
          />

          <ToggleRow
            label="Mode nuit automatique"
            description="Pas d'alertes entre début et fin de nuit"
            checked={Boolean(settings.nuit_auto_enabled)}
            onChange={(v) => void persist("nuit_auto_enabled", v)}
            border={false}
          />
          {settings.nuit_auto_enabled && (
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <label style={{ flex: 1, fontSize: 13, color: "#4A3F5C" }}>
                Début nuit
                <input
                  type="time"
                  value={settings.nuit_auto_debut ?? "21:00"}
                  onChange={(e) => void persist("nuit_auto_debut", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1.5px solid #F0E8F5",
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 13, color: "#4A3F5C" }}>
                Fin nuit
                <input
                  type="time"
                  value={settings.nuit_auto_fin ?? "07:00"}
                  onChange={(e) => void persist("nuit_auto_fin", e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1.5px solid #F0E8F5",
                    fontSize: 14,
                  }}
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              window.location.href = "/test-push";
            }}
            style={{
              width: "100%",
              padding: "12px 16px",
              backgroundColor: "#F0E8F5",
              color: "#4A3F5C",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 12,
            }}
          >
            🧪 Tester les notifications push
          </button>
        </section>

        {/* SECTION 2 — Biberon */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>🍼 Biberon</h2>
          <ToggleRow
            label="Intervalle automatique selon l'âge"
            checked={settings.biberon_intervalle_auto !== false}
            onChange={(v) => void persist("biberon_intervalle_auto", v)}
          />
          {settings.biberon_intervalle_auto === false && (
            <ChipGroup
              options={[
                { label: "2h", value: 120 },
                { label: "2h30", value: 150 },
                { label: "3h", value: 180 },
                { label: "3h30", value: 210 },
                { label: "4h", value: 240 },
                { label: "4h30", value: 270 },
                { label: "5h", value: 300 },
              ]}
              value={settings.biberon_intervalle_minutes ?? 210}
              onChange={(v) => void persist("biberon_intervalle_minutes", v)}
            />
          )}
          <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "16px 0 0" }}>
            Quantité par défaut
          </p>
          <ChipGroup
            options={[
              { label: "100ml", value: 100 },
              { label: "120ml", value: 120 },
              { label: "150ml", value: 150 },
              { label: "180ml", value: 180 },
              { label: "200ml", value: 200 },
              { label: "210ml", value: 210 },
              { label: "240ml", value: 240 },
            ]}
            value={settings.biberon_quantite_defaut ?? 150}
            onChange={(v) => void persist("biberon_quantite_defaut", v)}
          />
        </section>

        {/* SECTION 3 — Sommeil */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>🌙 Sommeil</h2>
          <label style={{ display: "block", fontSize: 13, color: "#4A3F5C", marginBottom: 12 }}>
            Heure de coucher habituelle
            <input
              type="time"
              value={settings.heure_coucher_defaut ?? "21:00"}
              onChange={(e) => void persist("heure_coucher_defaut", e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </label>
          <label style={{ display: "block", fontSize: 13, color: "#4A3F5C", marginBottom: 12 }}>
            Heure de réveil habituelle
            <input
              type="time"
              value={settings.heure_reveil_defaut ?? "07:00"}
              onChange={(e) => void persist("heure_reveil_defaut", e.target.value)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1.5px solid #F0E8F5",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </label>

          <p style={{ fontSize: 13, fontWeight: 700, color: "#4A3F5C", margin: "20px 0 0" }}>
            😴 Sieste
          </p>
          <ToggleRow
            label="Notifications pendant la sieste"
            checked={Boolean(settings.sieste_notif_enabled)}
            onChange={(v) => void persist("sieste_notif_enabled", v)}
          />
          {settings.sieste_notif_enabled && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "8px 0 0" }}>
                Rappel toutes les...
              </p>
              <ChipGroup
                options={[
                  { label: "10 min", value: 10 },
                  { label: "15 min", value: 15 },
                  { label: "20 min", value: 20 },
                  { label: "30 min", value: 30 },
                  { label: "45 min", value: 45 },
                  { label: "1h", value: 60 },
                ]}
                value={settings.sieste_notif_interval_minutes ?? 15}
                onChange={(v) => void persist("sieste_notif_interval_minutes", v)}
              />
            </>
          )}
          <ToggleRow
            label="Alerte sieste trop longue"
            checked={Boolean(settings.sieste_alerte_enabled)}
            onChange={(v) => void persist("sieste_alerte_enabled", v)}
          />
          {settings.sieste_alerte_enabled && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "8px 0 0" }}>
                M&apos;alerter si sieste dépasse...
              </p>
              <ChipGroup
                options={[
                  { label: "1h", value: 60 },
                  { label: "1h30", value: 90 },
                  { label: "2h", value: 120 },
                  { label: "2h30", value: 150 },
                  { label: "3h", value: 180 },
                ]}
                value={settings.sieste_alerte_minutes ?? 120}
                onChange={(v) => void persist("sieste_alerte_minutes", v)}
              />
            </>
          )}

          <p style={{ fontSize: 13, fontWeight: 700, color: "#4A3F5C", margin: "20px 0 0" }}>
            🌙 Nuit
          </p>
          <ToggleRow
            label="Notifications pendant la nuit"
            checked={Boolean(settings.nuit_notif_enabled)}
            onChange={(v) => void persist("nuit_notif_enabled", v)}
          />
          {settings.nuit_notif_enabled && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "8px 0 0" }}>
                Rappel toutes les...
              </p>
              <ChipGroup
                options={[
                  { label: "30 min", value: 30 },
                  { label: "1h", value: 60 },
                  { label: "2h", value: 120 },
                  { label: "3h", value: 180 },
                ]}
                value={settings.nuit_notif_interval_minutes ?? 60}
                onChange={(v) => void persist("nuit_notif_interval_minutes", v)}
              />
            </>
          )}
          <ToggleRow
            label="Alerte nuit trop courte"
            checked={Boolean(settings.nuit_alerte_courte_enabled)}
            onChange={(v) => void persist("nuit_alerte_courte_enabled", v)}
            border={false}
          />
          {settings.nuit_alerte_courte_enabled && (
            <ChipGroup
              options={[
                { label: "4h", value: 240 },
                { label: "5h", value: 300 },
                { label: "6h", value: 360 },
                { label: "7h", value: 420 },
                { label: "8h", value: 480 },
              ]}
              value={settings.nuit_alerte_courte_minutes ?? 360}
              onChange={(v) => void persist("nuit_alerte_courte_minutes", v)}
            />
          )}
        </section>

        {/* SECTION 4 — Bébé */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>👶 Bébé</h2>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#4A3F5C", margin: "0 0 8px" }}>
            Unité poids
          </p>
          <ChipGroup
            options={[
              { label: "kg", value: "kg" as const },
              { label: "g", value: "g" as const },
            ]}
            value={settings.unite_poids ?? "kg"}
            onChange={(v) => void persist("unite_poids", v)}
          />
          <p style={{ fontSize: 13, color: "#8B7FA0", margin: "16px 0 0" }}>
            Fuseau horaire : <strong style={{ color: "#4A3F5C" }}>{timezone}</strong>
          </p>
        </section>

        {/* SECTION 5 — Famille */}
        {familyId && (
          <section style={sectionCard}>
            <h2 style={sectionTitle}>👨‍👩‍👧 Ma famille</h2>
            {inviteCode && (
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: "#8B7FA0", margin: "0 0 8px" }}>
                  Code famille
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: 6,
                    color: "#4A3F5C",
                    margin: "0 0 12px",
                  }}
                >
                  {inviteCode}
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 20,
                    border: "none",
                    backgroundColor: "#E8406A",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {inviteCopied ? "Copié ✓" : "Copier le code"}
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {membres.map((membre) => {
                const roleInfo = getRoleLabel(membre.role);
                const prenom = getMemberPrenom(membre);
                const isOnline = onlineUserIds.has(membre.id);
                const isMe = membre.id === userId;
                return (
                  <div
                    key={membre.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid #F0E8F5",
                      backgroundColor: "#FDF8F2",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{roleInfo.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: "#4A3F5C" }}>
                        {prenom}
                        {isMe ? " (vous)" : ""}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8B7FA0" }}>
                        {roleInfo.label} · {isOnline ? "🟢 En ligne" : "⚫ " + formatLastSeen(membre.last_seen, false)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 6 — Confidentialité */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>🔒 Confidentialité</h2>
          <button
            type="button"
            onClick={() => void handleExportData()}
            disabled={exporting || !babyId}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 14,
              border: "1.5px solid #F0E8F5",
              backgroundColor: "white",
              color: "#4A3F5C",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            📤 Exporter mes données
          </button>
          {deleteStep === 1 && (
            <p style={{ fontSize: 13, color: "#C03060", margin: "0 0 10px" }}>
              Êtes-vous sûr ?
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleDeleteAllData()}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 14,
              border: "1.5px solid #FFE0E8",
              backgroundColor: deleteStep === 1 ? "#E8406A" : "#FFF0F5",
              color: deleteStep === 1 ? "white" : "#E8406A",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            {deleteStep === 0
              ? "🗑️ Supprimer toutes mes données"
              : "Confirmer la suppression"}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 16,
              border: "1px solid #FFE0E8",
              backgroundColor: "#FFF0F5",
              color: "#E8406A",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🚪 Se déconnecter
          </button>
        </section>

        {/* SECTION 7 — À propos */}
        <section style={sectionCard}>
          <h2 style={sectionTitle}>ℹ️ À propos</h2>
          <p style={{ fontSize: 14, color: "#4A3F5C", margin: "0 0 12px" }}>
            Bebebou v1.0
          </p>
          <a
            href="mailto:mahfoud.benlakehal@gmail.com"
            style={{
              display: "block",
              fontSize: 14,
              color: "#E8406A",
              fontWeight: 600,
              textDecoration: "none",
              marginBottom: 12,
            }}
          >
            Nous contacter
          </a>
          <Link
            href="/confidentialite"
            style={{
              fontSize: 14,
              color: "#8B7FA0",
              textDecoration: "none",
            }}
          >
            Politique de confidentialité
          </Link>
        </section>
      </div>
    </main>
  );
}
