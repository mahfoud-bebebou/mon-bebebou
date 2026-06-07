"use client";

import { ROLES } from "@/lib/roles";

type RoleGridProps = {
  selectedRole: string;
  onSelect: (roleId: string) => void;
  title?: string;
  disabled?: boolean;
};

export function RoleGrid({
  selectedRole,
  onSelect,
  title = "Tu es...",
  disabled = false,
}: RoleGridProps) {
  return (
    <div>
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#4A3F5C",
          margin: "0 0 12px",
        }}
      >
        {title}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        {ROLES.map((role) => {
          const active = selectedRole === role.id;
          return (
            <button
              key={role.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(role.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "12px 6px",
                borderRadius: 16,
                border: active ? "2px solid #E8406A" : "1.5px solid #F0E8F5",
                backgroundColor: active ? "#FFF0F5" : "white",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 28, marginBottom: 4 }}>{role.emoji}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: active ? "#E8406A" : "#4A3F5C",
                  textAlign: "center",
                }}
              >
                {role.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
