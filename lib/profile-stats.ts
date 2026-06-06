import type { BebebouEvent } from "./supabase";

export type ProfileStats = {
  biberonsToday: number;
  biberonsYesterday: number;
  avgIntervalLabel: string;
  lastWeight: number | null;
  weeklyBiberons: { label: string; count: number }[];
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function computeProfileStats(
  events: BebebouEvent[],
  lastWeight: number | null
): ProfileStats {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const biberons = events.filter((e) => e.type === "biberon");
  const biberonsToday = biberons.filter((e) =>
    isSameDay(new Date(e.created_at), now)
  ).length;
  const biberonsYesterday = biberons.filter((e) =>
    isSameDay(new Date(e.created_at), yesterday)
  ).length;

  let avgIntervalLabel = "—";
  if (biberons.length >= 2) {
    const sorted = [...biberons].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff =
        (new Date(sorted[i].created_at).getTime() -
          new Date(sorted[i - 1].created_at).getTime()) /
        60000;
      if (diff > 0 && diff < 24 * 60) gaps.push(diff);
    }
    if (gaps.length > 0) {
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      avgIntervalLabel = formatInterval(avg);
    }
  }

  const weeklyBiberons: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const label = day.toLocaleDateString("fr-FR", { weekday: "short" });
    const count = biberons.filter((e) =>
      isSameDay(new Date(e.created_at), day)
    ).length;
    weeklyBiberons.push({ label, count });
  }

  return {
    biberonsToday,
    biberonsYesterday,
    avgIntervalLabel,
    lastWeight,
    weeklyBiberons,
  };
}
