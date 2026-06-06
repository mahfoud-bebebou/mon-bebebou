import { supabase } from "./supabase";

export const BABY_AVATAR_KEY = "baby_avatar";

const DEMO_AVATAR_PREFIX = "bebebou-avatar-";

export function getBabyInitials(prenom: string): string {
  const trimmed = prenom.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function isValidAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("data:image/") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  );
}

export function loadBabyAvatar(): string | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(BABY_AVATAR_KEY);
  if (isValidAvatarUrl(saved)) return saved;
  return null;
}

export function saveBabyAvatar(base64: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BABY_AVATAR_KEY, base64);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Lecture du fichier impossible"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** @deprecated Utiliser loadBabyAvatar */
export function loadDemoAvatar(sessionId: string): string | null {
  if (typeof window === "undefined") return null;
  const unified = loadBabyAvatar();
  if (unified) return unified;
  return localStorage.getItem(DEMO_AVATAR_PREFIX + sessionId);
}

/** @deprecated Utiliser saveBabyAvatar */
export function saveDemoAvatar(sessionId: string, dataUrl: string): void {
  saveBabyAvatar(dataUrl);
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_AVATAR_PREFIX + sessionId, dataUrl);
}

export function getAuthAvatarPath(userId: string): string {
  return `${userId}/baby.jpg`;
}

export async function uploadAuthAvatar(
  userId: string,
  file: File
): Promise<string | null> {
  const path = getAuthAvatarPath(userId);
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });

  if (error) throw error;
  return getAuthAvatarPublicUrl(userId);
}

export function getAuthAvatarPublicUrl(userId: string): string {
  const path = getAuthAvatarPath(userId);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function loadAuthAvatarUrl(
  userId: string
): Promise<string | null> {
  const local = loadBabyAvatar();
  if (local) return local;

  const url = getAuthAvatarPublicUrl(userId);
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return url;
  } catch {
    // bucket may be private or missing
  }
  return null;
}
