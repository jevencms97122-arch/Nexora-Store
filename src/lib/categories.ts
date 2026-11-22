import type { AppKind } from "./types";

export interface Category {
  id: string;
  name: string;
  kind: AppKind;
}

export const CATEGORIES: Category[] = [
  { id: "action", name: "Action", kind: "game" },
  { id: "adventure", name: "Aventure", kind: "game" },
  { id: "racing", name: "Course", kind: "game" },
  { id: "rpg", name: "RPG", kind: "game" },
  { id: "strategy", name: "Stratégie", kind: "game" },
  { id: "puzzle", name: "Réflexion", kind: "game" },
  { id: "sport", name: "Sport", kind: "game" },
  { id: "simulation", name: "Simulation", kind: "game" },
  { id: "arcade", name: "Arcade", kind: "game" },
  { id: "other-game", name: "Autres jeux", kind: "game" },
  { id: "tools", name: "Outils", kind: "app" },
  { id: "productivity", name: "Productivité", kind: "app" },
  { id: "media", name: "Multimédia", kind: "app" },
  { id: "creative", name: "Création", kind: "app" },
  { id: "dev", name: "Développement", kind: "app" },
  { id: "social", name: "Communication", kind: "app" },
  { id: "education", name: "Éducation", kind: "app" },
  { id: "other-app", name: "Autres apps", kind: "app" },
];

export const categoriesOf = (kind: AppKind) => CATEGORIES.filter((c) => c.kind === kind);

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Categories are free text on the server. A known category (by id or by name, ignoring case and
 * accents) maps to its id; anything else is kept as typed, so "Launcher" becomes its own category.
 */
export function normalizeCategory(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const key = plain(text);
  const known = CATEGORIES.find((c) => c.id === key || plain(c.name) === key);
  return known ? known.id : text.charAt(0).toUpperCase() + text.slice(1);
}

export const categoryName = (id: string) => (id ? (CATEGORIES.find((c) => c.id === id)?.name ?? id) : "Sans catégorie");

/** Categories to show as filters: the known ones in order, then the custom ones. */
export function categoriesIn(apps: { category: string }[]): { id: string; name: string }[] {
  const used = new Set(apps.map((a) => a.category).filter(Boolean));
  const known = CATEGORIES.filter((c) => used.has(c.id));
  const custom = [...used].filter((id) => !CATEGORIES.some((c) => c.id === id)).sort((a, b) => a.localeCompare(b));
  return [...known, ...custom.map((id) => ({ id, name: id }))];
}

export const KIND_LABEL: Record<AppKind, string> = { game: "Jeu", app: "Application" };
