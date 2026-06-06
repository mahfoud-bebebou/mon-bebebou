"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { motion } from "framer-motion";
import {
  Baby,
  BarChart2,
  Home,
  MessageCircleHeart,
  UserCircle,
  type LucideProps,
} from "lucide-react";

const springTap = { type: "spring" as const, stiffness: 400, damping: 17 };

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type NavTab = {
  id: string;
  href: string;
  label: string;
  icon: ComponentType<LucideProps>;
  match: (pathname: string) => boolean;
  isCenter?: boolean;
};

const BASE_TABS: NavTab[] = [
  {
    id: "home",
    href: "/",
    label: "Accueil",
    icon: Home,
    match: (p) => p === "/",
  },
  {
    id: "suivi",
    href: "/suivi",
    label: "Suivi",
    icon: BarChart2,
    match: (p) => p.startsWith("/suivi"),
  },
  {
    id: "assistant",
    href: "/chat",
    label: "Assistant",
    icon: MessageCircleHeart,
    match: (p) => p.startsWith("/chat"),
    isCenter: true,
  },
  {
    id: "profil",
    href: "/profil",
    label: "Profil",
    icon: Baby,
    match: (p) => p.startsWith("/profil"),
  },
];

function StandardTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: ComponentType<LucideProps>;
  active: boolean;
}) {
  const color = active ? "#E8406A" : "#C4B5D4";

  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        flex: 1,
        minWidth: 0,
      }}
    >
      <motion.div
        whileTap={{ scale: 0.85 }}
        animate={{ scale: active ? 1.1 : 1 }}
        transition={springTap}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: "4px 16px",
          borderRadius: 12,
        }}
      >
        {active && (
          <motion.div
            layoutId="activeTab"
            animate={{ opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#FFF0F3",
              borderRadius: 12,
              zIndex: 0,
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Icon size={24} color={color} strokeWidth={active ? 2.25 : 2} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color,
              lineHeight: 1.2,
            }}
          >
            {label}
          </span>
        </div>
      </motion.div>
    </Link>
  );
}

function CenterTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: ComponentType<LucideProps>;
  active: boolean;
}) {
  const labelColor = active ? "#E8406A" : "#C4B5D4";

  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: -20,
        flex: 1,
        minWidth: 0,
      }}
    >
      <motion.div
        whileTap={{ scale: 0.85 }}
        animate={{ scale: active ? 1.1 : 1 }}
        transition={springTap}
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          backgroundColor: "#E8406A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(232,64,106,0.4)",
        }}
      >
        <Icon size={24} color="white" strokeWidth={2.25} />
      </motion.div>
      <span
        style={{
          marginTop: 4,
          fontSize: 10,
          fontWeight: 600,
          color: labelColor,
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(user));
    }
    checkAuth();
  }, [pathname]);

  const accountTab: NavTab = {
    id: "account",
    href: isAuthenticated ? "/compte" : "/login",
    label: isAuthenticated ? "Compte" : "Connexion",
    icon: UserCircle,
    match: (p) =>
      p.startsWith("/compte") ||
      p.startsWith("/login") ||
      p.startsWith("/register"),
  };

  const tabs: NavTab[] = [...BASE_TABS, accountTab];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 72,
        backgroundColor: "white",
        borderTop: "none",
        borderRadius: "24px 24px 0 0",
        boxShadow: "0 -8px 32px rgba(74,63,92,0.12)",
        padding: "8px 16px 16px",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "flex-end",
        boxSizing: "border-box",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);

        if (tab.isCenter) {
          return (
            <CenterTab
              key={tab.id}
              href={tab.href}
              label={tab.label}
              icon={tab.icon}
              active={active}
            />
          );
        }

        return (
          <StandardTab
            key={tab.id}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={active}
          />
        );
      })}
    </nav>
  );
}
