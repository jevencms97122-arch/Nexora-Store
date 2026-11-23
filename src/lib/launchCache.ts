import type { StoreApp } from "./types";

const KEY = "nexora.launch-cache";

export interface CachedApp {
  name: string;
  icon: string;
}

/** Keeps names and icons so the launcher can show them before the server answers. */
export function rememberApps(apps: StoreApp[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(apps.map((a) => [a.id, { name: a.name, icon: a.icon }]))));
  } catch {
    /* storage unavailable: the launcher falls back to the file name */
  }
}

export function cachedApp(id: string): CachedApp | null {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CachedApp>)[id] ?? null;
  } catch {
    return null;
  }
}
