"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function ComptePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      setEmail(user.email ?? null);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
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
        padding: "32px 16px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#4A3F5C",
            textAlign: "center",
            margin: "0 0 24px",
          }}
        >
          👤 Mon compte
        </h1>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 4px 16px rgba(74,63,92,0.06)",
            textAlign: "center",
          }}
        >
          {email && (
            <p style={{ fontSize: 15, color: "#4A3F5C", margin: "0 0 20px" }}>
              {email}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: "100%",
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
            Se déconnecter
          </button>
        </div>
      </div>
    </main>
  );
}
