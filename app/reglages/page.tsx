"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  type FamilyMemberProfile,
  extractOnlineUserIds,
  formatLastSeen,
  generateInviteCodeFromFamilyId,
  getMemberPrenom,
} from "@/lib/family";
import { getRoleLabel } from "@/lib/roles";

const AUTO_NIGHT_MODE_KEY = "bebebou_auto_night_mode";

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function sectionCardStyle() {
  return {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 8px 32px rgba(74,63,92,0.10)",
    marginBottom: 16,
  };
}

function sectionTitleStyle() {
  return {
    fontSize: 16,
    fontWeight: 800,
    color: "#4A3F5C",
    margin: "0 0 16px",
  };
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid #F0E8F5",
      }}
    >
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: disabled ? "#C4B5D4" : "#4A3F5C",
          }}
        >
          {label}
        </p>
        {description && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8B7FA0" }}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          border: "none",
          backgroundColor: checked ? "#E8406A" : "#E8E0F0",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            backgroundColor: "white",
            transition: "left 0.2s ease",
            boxShadow: "0 1px 4px rgba(74,63,92,0.2)",
          }}
        />
      </button>
    </div>
  );
}

export default function ReglagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [monRole, setMonRole] = useState("");
  const [monPrenomUser, setMonPrenomUser] = useState("");
  const [membres, setMembres] = useState<FamilyMemberProfile[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showInviteBlock, setShowInviteBlock] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [inviteCopied, setInviteCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [notifPermission, setNotifPermission] = useState<string>("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [autoNightMode, setAutoNightMode] = useState(false);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }

  const syncPushState = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotifPermission(Notification.permission);
    if (Notification.permission !== "granted") {
      setPushEnabled(false);
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    setPushEnabled(Boolean(sub));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAutoNightMode(localStorage.getItem(AUTO_NIGHT_MODE_KEY) === "true");
    }
    void syncPushState();
  }, [syncPushState]);

  useEffect(() => {
    async function load() {
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

      if (!profile?.family_id) {
        setLoading(false);
        return;
      }

      setFamilyId(profile.family_id);
      setMonRole(profile.role ?? "");
      setMonPrenomUser(
        profile.prenom?.trim() ||
          (profile.role === "papa"
            ? profile.prenom_papa
            : profile.prenom_maman) ||
          profile.prenom_maman ||
          profile.prenom_papa ||
          ""
      );

      const expectedInviteCode = generateInviteCodeFromFamilyId(profile.family_id);
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
      setLoading(false);
    }

    void load();
  }, [router]);

  useEffect(() => {
    if (!familyId || !userId) return;

    const supabase = createSupabaseClient();
    type PresencePayload = { user_id: string; online_at: string };

    const presenceChannel = supabase
      .channel(`family-presence-${familyId}`)
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<PresencePayload>();
        setOnlineUserIds(extractOnlineUserIds(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabase.removeChannel(presenceChannel);
      setOnlineUserIds(new Set());
    };
  }, [familyId, userId]);

  async function handleCopyInviteCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      showToast("Impossible de copier le code");
    }
  }

  async function enablePushNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ||
        (vapidKey
          ? await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: vapidKey,
            })
          : null);

      if (!subscription) {
        showToast("Clé VAPID manquante");
        return;
      }

      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("family_id")
        .eq("id", user.id)
        .single();

      if (!profile?.family_id) return;

      const { data: baby } = await supabase
        .from("babies")
        .select("id")
        .eq("family_id", profile.family_id)
        .single();

      if (!baby) return;

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          baby_id: baby.id,
          user_id: user.id,
        }),
      });

      setPushEnabled(true);
      showToast("Rappels biberon activés ✅");
    } finally {
      setPushLoading(false);
    }
  }

  async function handlePushToggle(enabled: boolean) {
    if (enabled) {
      await enablePushNotifications();
      return;
    }

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    }
    setPushEnabled(false);
  }

  function handleAutoNightToggle(enabled: boolean) {
    setAutoNightMode(enabled);
    localStorage.setItem(AUTO_NIGHT_MODE_KEY, enabled ? "true" : "false");
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
        <p style={{ fontSize: 14, color: "#8B7FA0" }}>Chargement...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        padding: "32px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#4CAF50",
            color: "white",
            borderRadius: 20,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            zIndex: 200,
          }}
        >
          {toastMessage}
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
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

        <section style={sectionCardStyle()}>
          <h2 style={sectionTitleStyle()}>🔔 Notifications</h2>

          {notifPermission === "denied" ? (
            <p style={{ fontSize: 13, color: "#8B7FA0", margin: 0 }}>
              Désactivé dans les réglages iOS
            </p>
          ) : notifPermission === "default" ? (
            <button
              type="button"
              onClick={() => void enablePushNotifications()}
              disabled={pushLoading}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 16,
                backgroundColor: "#E8406A",
                color: "white",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor: pushLoading ? "not-allowed" : "pointer",
              }}
            >
              {pushLoading ? "Activation..." : "Activer les rappels biberon"}
            </button>
          ) : (
            <ToggleRow
              label="Rappels biberon"
              description="Notification 15 min avant le prochain biberon"
              checked={pushEnabled}
              disabled={pushLoading}
              onChange={(value) => void handlePushToggle(value)}
            />
          )}

          <div style={{ borderBottom: "none" }}>
            <ToggleRow
              label="Mode nuit automatique"
              description="Entre 21h et 7h → pas d'alertes"
              checked={autoNightMode}
              onChange={handleAutoNightToggle}
            />
          </div>
        </section>

        <section style={sectionCardStyle()}>
          <h2 style={sectionTitleStyle()}>🎨 Affichage</h2>
          <ToggleRow
            label="Mode sombre"
            description="Bientôt disponible"
            checked={false}
            disabled
            onChange={() => undefined}
          />
        </section>

        {familyId && (
          <section style={sectionCardStyle()}>
            <h2 style={sectionTitleStyle()}>👨‍👩‍👧 Ma famille</h2>

            {(() => {
              const roleInfo = getRoleLabel(monRole);
              return (
                <div
                  style={{
                    backgroundColor: `${roleInfo.color}33`,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      backgroundColor: roleInfo.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 32,
                      flexShrink: 0,
                    }}
                  >
                    {roleInfo.emoji}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#4A3F5C",
                        margin: "0 0 6px",
                      }}
                    >
                      {monPrenomUser || "Moi"}
                    </p>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: roleInfo.color,
                        borderRadius: 20,
                        padding: "4px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#4A3F5C",
                      }}
                    >
                      {roleInfo.emoji} {roleInfo.label}
                    </span>
                  </div>
                </div>
              );
            })()}

            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#8B7FA0",
                textTransform: "uppercase",
                letterSpacing: 1,
                margin: "0 0 12px",
              }}
            >
              Membres connectés
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {membres
                .filter((m) => m.id !== userId)
                .map((membre) => {
                  const roleInfo = getRoleLabel(membre.role);
                  const prenom = getMemberPrenom(membre);
                  const isOnline = onlineUserIds.has(membre.id);
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
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          backgroundColor: roleInfo.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 22,
                          flexShrink: 0,
                        }}
                      >
                        {roleInfo.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#4A3F5C",
                            margin: "0 0 4px",
                          }}
                        >
                          {prenom}
                        </p>
                        <p
                          style={{
                            fontSize: 12,
                            color: isOnline ? "#4CAF50" : "#8B7FA0",
                            margin: 0,
                          }}
                        >
                          {isOnline
                            ? "🟢 En ligne"
                            : "⚫ " + formatLastSeen(membre.last_seen, false)}
                        </p>
                      </div>
                    </div>
                  );
                })}

              {membres.filter((m) => m.id !== userId).length === 0 && (
                <p style={{ fontSize: 13, color: "#8B7FA0", margin: 0 }}>
                  Tu es le seul membre pour l&apos;instant.
                </p>
              )}
            </div>

            {membres.length < 5 && (
              <button
                type="button"
                onClick={() => setShowInviteBlock((v) => !v)}
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: "white",
                  border: "1.5px solid #E8406A",
                  color: "#E8406A",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ➕ Inviter un co-parent
              </button>
            )}

            {showInviteBlock && inviteCode && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 14,
                  backgroundColor: "#FDF8F2",
                  border: "1px solid #F0E8F5",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "#8B7FA0",
                    margin: "0 0 8px",
                  }}
                >
                  Partage ce code avec ta famille :
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 24,
                      fontWeight: 800,
                      letterSpacing: 4,
                      color: "#4A3F5C",
                      textAlign: "center",
                    }}
                  >
                    {inviteCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyInviteCode()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      backgroundColor: "#E8406A",
                      color: "white",
                      border: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inviteCopied ? "Copié ✓" : "Copier"}
                  </button>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#8B7FA0",
                    margin: "10px 0 0",
                    textAlign: "center",
                  }}
                >
                  Rejoindre sur{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/rejoindre")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#E8406A",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    /rejoindre
                  </button>
                </p>
              </div>
            )}
          </section>
        )}

        <section style={sectionCardStyle()}>
          <h2 style={sectionTitleStyle()}>ℹ️ À propos</h2>
          <p style={{ fontSize: 14, color: "#4A3F5C", margin: "0 0 12px" }}>
            Bebebou v1.0
          </p>
          <a
            href="mailto:contact@monbebebou.fr"
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
          <button
            type="button"
            onClick={() => showToast("Politique de confidentialité — bientôt")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 14,
              color: "#8B7FA0",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Politique de confidentialité
          </button>
        </section>
      </div>
    </main>
  );
}
