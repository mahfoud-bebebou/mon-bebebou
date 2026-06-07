import { getRoleLabel } from "./roles";

export type FamilyMemberProfile = {
  id: string;
  prenom?: string | null;
  prenom_maman?: string | null;
  prenom_papa?: string | null;
  role?: string | null;
  last_seen?: string | null;
};

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function getMemberPrenom(member: FamilyMemberProfile): string {
  if (member.prenom?.trim()) return member.prenom.trim();
  if (member.role === "papa" && member.prenom_papa?.trim()) {
    return member.prenom_papa.trim();
  }
  if (member.role === "maman" && member.prenom_maman?.trim()) {
    return member.prenom_maman.trim();
  }
  return member.prenom_maman?.trim() || member.prenom_papa?.trim() || "Membre";
}

export function formatMemberDisplay(member: FamilyMemberProfile): string {
  const role = getRoleLabel(member.role);
  return `${role.emoji} ${getMemberPrenom(member)}`;
}

export function formatLastSeen(
  iso: string | null | undefined,
  isOnline: boolean
): string {
  if (isOnline) return "En ligne";
  if (!iso) return "Hors ligne";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Vu à l'instant";
  if (minutes < 60) return `Vu il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Vu il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Vu il y a ${days}j`;
}

export function extractOnlineUserIds(
  presenceState: Record<string, { user_id: string }[]>
): Set<string> {
  const ids = new Set<string>();
  Object.values(presenceState)
    .flat()
    .forEach((entry) => {
      if (entry.user_id) ids.add(entry.user_id);
    });
  return ids;
}
