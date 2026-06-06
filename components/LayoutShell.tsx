"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { BottomNav } from "./BottomNav";
import { PageTransition } from "./PageTransition";

const HIDDEN_NAV_PATHS = ["/login", "/register"];

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showNav = !HIDDEN_NAV_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  return (
    <>
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
