"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  clearDemoSession,
  DEMO_SESSION_KEY,
  migrateDemoEvents,
  saveWeightLocalStorage,
} from "@/lib/demo";

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type BabyCount = 1 | 2 | 3;
type Sexe = "fille" | "garcon" | "";
type Parcours = "allaite" | "artificiel" | "mixte" | "";

type BabyForm = {
  prenom: string;
  dateNaissance: string;
  sexe: Sexe;
  poidsNaissance: string;
  poidsActuel: string;
};

const EMPTY_BABY: BabyForm = {
  prenom: "",
  dateNaissance: "",
  sexe: "",
  poidsNaissance: "",
  poidsActuel: "",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#8B7FA0",
  textTransform: "uppercase",
  letterSpacing: 1,
  margin: "0 0 10px 4px",
};

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

const cardStyle: CSSProperties = {
  backgroundColor: "white",
  borderRadius: 20,
  padding: 20,
};

function selectBtnStyle(selected: boolean, disabled: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    padding: "12px 10px",
    borderRadius: 12,
    border: selected ? "1.5px solid #E8406A" : "1.5px solid #F0E8F5",
    backgroundColor: selected ? "#E8406A" : "white",
    color: selected ? "white" : "#4A3F5C",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    textAlign: "center",
  };
}

function parseWeight(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const num = parseFloat(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [momName, setMomName] = useState("");
  const [dadName, setDadName] = useState("");
  const [babyCount, setBabyCount] = useState<BabyCount>(1);
  const [babies, setBabies] = useState<BabyForm[]>([{ ...EMPTY_BABY }]);
  const [parcours, setParcours] = useState<Parcours>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleBabyCountChange(count: BabyCount) {
    setBabyCount(count);
    setBabies((prev) => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        return [
          ...prev,
          ...Array.from({ length: count - prev.length }, () => ({ ...EMPTY_BABY })),
        ];
      }
      return prev.slice(0, count);
    });
  }

  function updateBaby(index: number, field: keyof BabyForm, value: string) {
    setBabies((prev) =>
      prev.map((baby, i) => (i === index ? { ...baby, [field]: value } : baby))
    );
  }

  function validateForm(): string | null {
    if (!email.trim()) return "L'email est requis.";
    if (!password) return "Le mot de passe est requis.";
    if (!familyName.trim()) return "Le nom de famille est requis.";
    if (!momName.trim()) return "Le prénom de maman est requis.";
    if (!dadName.trim()) return "Le prénom de papa est requis.";
    if (!parcours) return "Sélectionnez votre parcours d'alimentation.";

    for (let i = 0; i < babyCount; i++) {
      const baby = babies[i];
      const label = babyCount > 1 ? ` (bébé ${i + 1})` : "";
      if (!baby.prenom.trim()) return `Le prénom du bébé${label} est requis.`;
      if (!baby.dateNaissance) return `La date de naissance${label} est requise.`;
      if (!baby.sexe) return `Sélectionnez le sexe${label}.`;
      if (!parseWeight(baby.poidsNaissance)) {
        return `Le poids de naissance${label} est requis (en kg).`;
      }
      if (!parseWeight(baby.poidsActuel)) {
        return `Le poids actuel${label} est requis (en kg).`;
      }
    }

    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createSupabaseClient();

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (!userId) throw new Error("Pas de user id");

      const { data: family, error: familyError } = await supabase
        .from("families")
        .insert({
          name: familyName.trim(),
          created_by: userId,
        })
        .select()
        .single();

      if (familyError) throw familyError;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        email: email.trim(),
        prenom_maman: momName.trim(),
        prenom_papa: dadName.trim(),
        family_id: family.id,
      });

      if (profileError) throw profileError;

      const babiesToInsert = babies.slice(0, babyCount).map((baby) => ({
        prenom: baby.prenom.trim(),
        date_naissance: baby.dateNaissance,
        sexe: baby.sexe,
        poids_naissance: parseWeight(baby.poidsNaissance),
        poids_actuel: parseWeight(baby.poidsActuel),
        parcours,
        family_id: family.id,
      }));

      const { error: babiesError } = await supabase
        .from("babies")
        .insert(babiesToInsert);

      if (babiesError) throw babiesError;

      const firstBaby = babiesToInsert[0];
      if (firstBaby.poids_naissance && firstBaby.poids_actuel) {
        saveWeightLocalStorage(
          firstBaby.poids_naissance,
          firstBaby.poids_actuel
        );
      }

      const sessionId = localStorage.getItem(DEMO_SESSION_KEY);
      if (sessionId) {
        await migrateDemoEvents(sessionId, userId);
        clearDemoSession();
      }

      router.push("/");
    } catch (err) {
      console.error("[Register]", err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Erreur lors de la création du compte";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        padding: "32px 16px 48px",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 28,
          }}
        >
          <img
            src="/logo-horizontal.png"
            alt="Mon Bebebou"
            style={{
              width: "100%",
              maxWidth: 200,
              height: "auto",
              display: "block",
            }}
          />
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Section 1 — Mon compte */}
          <section>
            <h2 style={sectionTitleStyle}>Mon compte</h2>
            <div style={cardStyle}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@email.com"
                  autoComplete="email"
                  style={inputStyle}
                  disabled={loading}
                />
              </div>
              <div>
                <label style={labelStyle}>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={inputStyle}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          {/* Section 2 — Notre famille */}
          <section>
            <h2 style={sectionTitleStyle}>Notre famille</h2>
            <div style={cardStyle}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Nom de famille</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Ex: Benlakehal"
                  style={inputStyle}
                  disabled={loading}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Prénom maman</label>
                <input
                  type="text"
                  value={momName}
                  onChange={(e) => setMomName(e.target.value)}
                  placeholder="Marie"
                  style={inputStyle}
                  disabled={loading}
                />
              </div>
              <div>
                <label style={labelStyle}>Prénom papa</label>
                <input
                  type="text"
                  value={dadName}
                  onChange={(e) => setDadName(e.target.value)}
                  placeholder="Thomas"
                  style={inputStyle}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          {/* Section 3 — Notre bébé */}
          <section>
            <h2 style={sectionTitleStyle}>Notre bébé</h2>
            <div style={cardStyle}>
              <label style={labelStyle}>Nombre de bébés</label>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 20,
                  flexWrap: "wrap",
                }}
              >
                {(
                  [
                    [1, "👶 1 bébé"],
                    [2, "👶👶 Jumeaux"],
                    [3, "👶👶👶 Triplés"],
                  ] as [BabyCount, string][]
                ).map(([count, label]) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => handleBabyCountChange(count)}
                    disabled={loading}
                    style={selectBtnStyle(babyCount === count, loading)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {babies.slice(0, babyCount).map((baby, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: index < babyCount - 1 ? 24 : 0,
                    paddingBottom: index < babyCount - 1 ? 24 : 0,
                    borderBottom:
                      index < babyCount - 1 ? "1px solid #F0E8F5" : "none",
                  }}
                >
                  {babyCount > 1 && (
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#4A3F5C",
                        margin: "0 0 14px",
                      }}
                    >
                      Bébé {index + 1}
                    </p>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Prénom</label>
                    <input
                      type="text"
                      value={baby.prenom}
                      onChange={(e) =>
                        updateBaby(index, "prenom", e.target.value)
                      }
                      placeholder="Louise"
                      style={inputStyle}
                      disabled={loading}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Date de naissance</label>
                    <input
                      type="date"
                      value={baby.dateNaissance}
                      onChange={(e) =>
                        updateBaby(index, "dateNaissance", e.target.value)
                      }
                      style={inputStyle}
                      disabled={loading}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Sexe</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => updateBaby(index, "sexe", "fille")}
                        disabled={loading}
                        style={selectBtnStyle(baby.sexe === "fille", loading)}
                      >
                        👧 Fille
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBaby(index, "sexe", "garcon")}
                        disabled={loading}
                        style={selectBtnStyle(baby.sexe === "garcon", loading)}
                      >
                        👦 Garçon
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Poids de naissance (kg)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={baby.poidsNaissance}
                      onChange={(e) =>
                        updateBaby(index, "poidsNaissance", e.target.value)
                      }
                      placeholder="3.2"
                      style={inputStyle}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Poids actuel (kg)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={baby.poidsActuel}
                      onChange={(e) =>
                        updateBaby(index, "poidsActuel", e.target.value)
                      }
                      placeholder="4.5"
                      style={inputStyle}
                      disabled={loading}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4 — Parcours */}
          <section>
            <h2 style={sectionTitleStyle}>Parcours</h2>
            <div style={cardStyle}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    ["allaite", "🤱 Allaitement"],
                    ["artificiel", "🍼 Biberon"],
                    ["mixte", "🤱🍼 Mixte"],
                  ] as [Parcours, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setParcours(value)}
                    disabled={loading}
                    style={selectBtnStyle(parcours === value, loading)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#FFF0F3",
              border: "1px solid #F9A8C0",
              borderRadius: 12,
              padding: 12,
              marginTop: 20,
              color: "#C03060",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 14,
            background: "linear-gradient(135deg, #E8406A, #F472B6)",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            boxShadow: "0 4px 16px rgba(232,64,106,0.35)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            marginTop: 24,
          }}
        >
          {loading ? "Création..." : "Créer mon compte"}
        </button>
      </div>
    </main>
  );
}
