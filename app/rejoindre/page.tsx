"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { RoleGrid } from "@/components/RoleGrid";
import { getRoleLabel } from "@/lib/roles";

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#4A3F5C",
  marginBottom: 6,
  display: "block",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "1.5px solid #F0E8F5",
  fontSize: 15,
  backgroundColor: "white",
  color: "#4A3F5C",
  outline: "none",
  boxSizing: "border-box",
};

export default function RejoindrePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeComplete = code.trim().length === 6;
  const canSubmit = codeComplete && selectedRole.length > 0;

  async function handleJoin() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const supabase = createSupabaseClient();

    try {
      if (!prenom.trim()) {
        setError("Ton prénom est requis.");
        setLoading(false);
        return;
      }

      let userId: string | undefined;

      const {
        data: { user: existingUser },
      } = await supabase.auth.getUser();

      if (existingUser) {
        userId = existingUser.id;
      } else {
        if (!email.trim() || !password) {
          setError("Email et mot de passe requis pour créer un compte.");
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        userId = data.user?.id;
        if (!userId) throw new Error("Compte créé mais utilisateur introuvable.");
      }

      const { data: familyId, error: rpcError } = await supabase.rpc(
        "get_family_id_by_invite",
        { p_code: code.trim().toUpperCase() }
      );

      if (rpcError) throw rpcError;
      if (!familyId) {
        setError("Code invalide — vérifie avec la personne qui t'a invité.");
        setLoading(false);
        return;
      }

      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("family_id", familyId);

      if ((count ?? 0) >= 5) {
        setError("Cette famille a déjà 5 membres.");
        setLoading(false);
        return;
      }

      const roleInfo = getRoleLabel(selectedRole);
      const profilePayload: Record<string, unknown> = {
        id: userId,
        email: email.trim() || existingUser?.email || null,
        family_id: familyId,
        role: selectedRole,
        prenom: prenom.trim(),
        last_seen: new Date().toISOString(),
      };

      if (selectedRole === "maman") profilePayload.prenom_maman = prenom.trim();
      if (selectedRole === "papa") profilePayload.prenom_papa = prenom.trim();

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload);

      if (profileError) throw profileError;

      router.push("/");
    } catch (err) {
      console.error("[Rejoindre]", err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Impossible de rejoindre cette famille";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 50,
          backgroundColor: "white",
          border: "1.5px solid #F0E8F5",
          borderRadius: 20,
          padding: "8px 16px",
          fontSize: 14,
          color: "#8B7FA0",
          cursor: "pointer",
        }}
      >
        ← Retour
      </button>

      <main
        style={{
          backgroundColor: "#FDF8F2",
          minHeight: "100vh",
          padding: "32px 16px 48px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#4A3F5C",
              textAlign: "center",
              margin: "0 0 8px",
            }}
          >
            Rejoindre une famille 👨‍👩‍👧
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#8B7FA0",
              textAlign: "center",
              margin: "0 0 24px",
            }}
          >
            Entre le code d&apos;invitation partagé par un parent
          </p>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <label style={labelStyle}>Code d&apos;invitation (6 caractères)</label>
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
              }
              placeholder="ABC123"
              maxLength={6}
              style={{
                ...inputStyle,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 6,
                textAlign: "center",
                marginBottom: 20,
              }}
            />

            <label style={labelStyle}>Ton prénom</label>
            <input
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Samia"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <RoleGrid
              selectedRole={selectedRole}
              onSelect={setSelectedRole}
              disabled={loading}
            />
          </div>

          <div
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#8B7FA0",
                margin: "0 0 12px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Compte
            </p>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@email.com"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: "#8B7FA0", margin: "10px 0 0" }}>
              Déjà connecté ? Laisse vide si tu es déjà connecté dans l&apos;app.
            </p>
          </div>

          {error && (
            <p
              style={{
                fontSize: 13,
                color: "#C03060",
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleJoin}
            disabled={loading || !canSubmit}
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 14,
              backgroundColor: "#E8406A",
              color: "white",
              fontSize: 16,
              fontWeight: 700,
              border: "none",
              cursor: loading || !canSubmit ? "not-allowed" : "pointer",
              opacity: loading || !canSubmit ? 0.6 : 1,
            }}
          >
            {loading ? "Connexion..." : "Rejoindre →"}
          </button>
        </div>
      </main>
    </>
  );
}
