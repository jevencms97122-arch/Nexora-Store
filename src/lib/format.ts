import type { PackageType } from "./types";

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export const PACKAGE_LABEL: Record<PackageType, string> = {
  zip: "Portable (ZIP)",
  exe: "Exécutable (EXE)",
  msi: "Installeur (MSI)",
};

export function packageTypeOf(fileName: string): PackageType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "zip" || ext === "exe" || ext === "msi" ? ext : null;
}

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico"];
export const PACKAGE_EXTENSIONS = ["exe", "msi", "zip"];

export const isImagePath = (p: string) => IMAGE_EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? "");
export const isPackagePath = (p: string) => PACKAGE_EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? "");

/** PocketBase-style 15 character id. */
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 15);
}

/** Deterministic hue from a string, for letter avatars and placeholders. */
export function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** True when `candidate` is a strictly newer version than `current` (compares 0.1.0 < 0.1.10 < 0.2). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parts = (v: string) => (v.match(/\d+/g) ?? []).map(Number);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
