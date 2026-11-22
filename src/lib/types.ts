export type AppKind = "game" | "app";
export type PackageType = "exe" | "msi" | "zip";

/** An app or game published in the store (mirrors the future PocketBase `apps` collection). */
export interface StoreApp {
  id: string;
  name: string;
  developer: string;
  description: string;
  kind: AppKind;
  category: string;
  version: string;
  packagePath: string;
  packageName: string;
  packageSize: number;
  packageType: PackageType;
  icon: string;
  screenshots: string[];
  featured: boolean;
  /** The app updates itself: the store never offers "Mettre à jour". */
  selfUpdate: boolean;
  created: string;
  updated: string;
}

/** What the add/edit form produces. Images may still point at `staging/`. */
export interface AppInput {
  name: string;
  developer: string;
  description: string;
  kind: AppKind;
  category: string;
  version: string;
  featured: boolean;
  selfUpdate: boolean;
  icon: string;
  screenshots: string[];
  /** Absolute path of a newly picked package; omitted to keep the current one. */
  packageSource?: string;
}

/** An app installed on this PC. Always local, whatever the store source is. */
export interface InstallRecord {
  appId: string;
  version: string;
  dir: string;
  launchPath: string;
  installedAt: string;
}

export interface Progress {
  done: number;
  total: number;
}

export type ProgressFn = (p: Progress) => void;
