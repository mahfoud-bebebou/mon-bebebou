"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { BottomNav } from "./BottomNav";
import { PageTransition } from "./PageTransition";

const HIDDEN_NAV_PATHS = ["/register", "/onboarding"];
const HIDDEN_HOME_PATHS = ["/", "/login"];

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const showNav = !HIDDEN_NAV_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const showHomeButton = !HIDDEN_HOME_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  return (
    <>
      {showHomeButton && (
        <button
          type="button"
          onClick={() => router.push("/")}
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
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Accueil
        </button>
      )}
      <AnimatePresence mode="wait">
        <PageTransition key={pathname}>
          <div
            style={{
              paddingBottom: showNav ? 96 : 0,
              minHeight: "100vh",
            }}
          >
            {children}
          </div>
        </PageTransition>
      </AnimatePresence>
      {showNav && <BottomNav />}
    </>
  );
}
