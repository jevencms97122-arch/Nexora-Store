import type { AppInput, InstallRecord, ProgressFn, StoreApp } from "../lib/types";

/** Where the catalog comes from: the PocketBase server. */
export interface StoreProvider {
  readonly id: "pocketbase";
  readonly label: string;
  /** Server address, shown in the settings. */
  readonly url: string;
  /** Whether apps can be added, edited and deleted (administrator signed in). */
  readonly canEdit: boolean;
  /** Restores the saved administrator session if it is still valid. */
  restore(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  listApps(): Promise<StoreApp[]>;
  saveApp(input: AppInput, existing: StoreApp | null, onProgress?: ProgressFn): Promise<StoreApp>;
  deleteApp(app: StoreApp): Promise<void>;
}

/** Installs on this PC. Always local, whatever the catalog source is. */
export interface InstallService {
  list(): Promise<InstallRecord[]>;
  install(app: StoreApp, onProgress: ProgressFn): Promise<InstallRecord>;
  launch(record: InstallRecord): Promise<void>;
  /** Throws when the user cancels the uninstaller (the app then stays installed). */
  uninstall(app: StoreApp, record: InstallRecord): Promise<void>;
  reveal(record: InstallRecord): Promise<void>;
  /** Records for apps already present on this PC (installed outside the store, or earlier). */
  detect?(apps: StoreApp[]): Promise<InstallRecord[]>;
}
