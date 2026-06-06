"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: data.user.email,
      });
    }

    setMessage("Compte créé ! Vérifiez votre email ou connectez-vous.");
    setLoading(false);
  }

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: data.user.email,
      });
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ backgroundColor: "#FDF8F2", paddingBottom: 100 }}
    >
      <div className="w-full max-w-sm">
        <header className="mb-8 flex justify-center">
          <img
            src="/logo-horizontal.png"
            alt="Mon Bebebou"
            className="h-auto w-full max-w-xs"
          />
        </header>

        <div className="rounded-3xl bg-white p-6 shadow-md">
          <h1 className="mb-1 text-center text-xl font-bold text-[#4A3F5C]">
            Bienvenue
          </h1>
          <p className="mb-6 text-center text-sm text-[#8B7FA0]">
            Connectez-vous pour suivre votre bébé
          </p>

          {error && (
            <p className="mb-4 rounded-2xl bg-red-100 px-4 py-3 text-center text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="mb-4 rounded-2xl bg-green-100 px-4 py-3 text-center text-sm text-green-700">
              {message}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4A3F5C]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-[#E8E0F0] px-4 py-3 text-[#4A3F5C] outline-none focus:border-[#C03060]"
                placeholder="vous@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#4A3F5C]">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-[#E8E0F0] px-4 py-3 text-[#4A3F5C] outline-none focus:border-[#C03060]"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading || !email || !password}
              className="w-full rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: "#E8406A" }}
            >
              {loading ? "Chargement..." : "Se connecter"}
            </button>

            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading || !email || !password}
              className="w-full rounded-2xl border-2 py-3 text-sm font-bold text-[#E8406A] disabled:opacity-60"
              style={{
                borderColor: "#E8406A",
                position: "relative",
                zIndex: 10,
              }}
            >
              Créer un compte
            </button>
          </div>

          <a
            href="/"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 16,
              fontSize: 13,
              color: "#8B7FA0",
              textDecoration: "none",
            }}
          >
            Continuer sans compte →
          </a>
        </div>
      </div>
    </main>
  );
}
