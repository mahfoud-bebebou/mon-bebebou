export type RoleDefinition = {
  id: string;
  label: string;
  emoji: string;
  color: string;
};

export const ROLES: RoleDefinition[] = [
  { id: "maman", label: "Maman", emoji: "👩", color: "#FFB6C1" },
  { id: "papa", label: "Papa", emoji: "👨", color: "#B6D0FF" },
  { id: "mamie", label: "Mamie", emoji: "👵", color: "#FFD9B6" },
  { id: "papi", label: "Papi", emoji: "👴", color: "#C8F0C8" },
  { id: "nounou", label: "Nounou", emoji: "🧑‍🍼", color: "#E8D5FF" },
  { id: "tatie", label: "Tatie", emoji: "👩‍❤️‍👩", color: "#FFE4E1" },
  { id: "tonton", label: "Tonton", emoji: "🧑", color: "#E0F0FF" },
  { id: "famille", label: "Famille", emoji: "👨‍👩‍👧", color: "#FFF3CD" },
];

const FALLBACK_ROLE: RoleDefinition = {
  id: "parent",
  label: "Parent",
  emoji: "👤",
  color: "#F0E8F5",
};

export function getRoleLabel(roleId: string | null | undefined): RoleDefinition {
  if (!roleId) return FALLBACK_ROLE;
  return ROLES.find((r) => r.id === roleId) ?? { ...FALLBACK_ROLE, id: roleId };
}
