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

export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? "Sans catégorie";

export const KIND_LABEL: Record<AppKind, string> = { game: "Jeu", app: "Application" };
