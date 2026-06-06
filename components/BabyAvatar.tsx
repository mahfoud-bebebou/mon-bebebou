import type { CSSProperties } from "react";
import { getBabyInitials, isValidAvatarUrl } from "@/lib/avatar";

type BabyAvatarProps = {
  prenom: string;
  photoUrl?: string | null;
  size?: number;
  onClick?: () => void;
  showCameraIcon?: boolean;
};

export function BabyAvatar({
  prenom,
  photoUrl,
  size = 48,
  onClick,
  showCameraIcon = false,
}: BabyAvatarProps) {
  const initials = getBabyInitials(prenom);
  const isClickable = Boolean(onClick);
  const hasPhoto = isValidAvatarUrl(photoUrl);

  const circleStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "2px solid #E8406A",
    overflow: "hidden",
    flexShrink: 0,
    position: "relative",
    cursor: isClickable ? "pointer" : "default",
    padding: 0,
    background: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const content = hasPhoto ? (
    <img
      src={photoUrl!}
      alt={prenom ? `Photo de ${prenom}` : "Photo du bébé"}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "50%",
        display: "block",
      }}
    />
  ) : (
    <span
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#E8406A",
        color: "white",
        fontSize: size >= 64 ? 28 : 18,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
      }}
    >
      {initials}
    </span>
  );

  const cameraBadge =
    showCameraIcon && isClickable ? (
      <span
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: size * 0.3,
          height: size * 0.3,
          minWidth: 22,
          minHeight: 22,
          borderRadius: "50%",
          backgroundColor: "white",
          border: "1.5px solid #E8406A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          lineHeight: 1,
          boxShadow: "0 2px 6px rgba(74,63,92,0.15)",
          zIndex: 2,
        }}
      >
        📷
      </span>
    ) : null;

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Changer la photo"
        style={circleStyle}
      >
        {content}
        {cameraBadge}
      </button>
    );
  }

  return (
    <div style={circleStyle}>
      {content}
      {cameraBadge}
    </div>
  );
}
