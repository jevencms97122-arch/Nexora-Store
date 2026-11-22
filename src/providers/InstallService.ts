import Database from "@tauri-apps/plugin-sql";
import { native, pickInstalledExe } from "../lib/native";
import type { InstallRecord, ProgressFn, StoreApp } from "../lib/types";
import type { InstallService } from "./StoreProvider";

let dbPromise: Promise<Database> | null = null;
const db = () => (dbPromise ??= Database.load("sqlite:nexora.db"));

interface InstallRow {
  app_id: string;
  version: string;
  dir: string;
  launch_path: string;
  installed_at: string;
}

/** What is installed on this PC (small local database); packages are downloaded from the server. */
export class LocalInstallService implements InstallService {
  async list() {
    const rows = await (await db()).select<InstallRow[]>("SELECT * FROM installs");
    return rows.map(
      (r): InstallRecord => ({
        appId: r.app_id,
        version: r.version,
        dir: r.dir,
        launchPath: r.launch_path,
        installedAt: r.installed_at,
      }),
    );
  }

  async install(app: StoreApp, onProgress: ProgressFn) {
    if (!app.packagePath) throw new Error("Cette application n'a pas de fichier sur le serveur");
    // Download takes the first half of the bar, installing the second half.
    const half = (offset: number): ProgressFn => ({ done, total }) =>
      onProgress(total ? { done: offset + (done / total) * 50, total: 100 } : { done: 0, total: 0 });
    const file = await native.downloadPackage(app.id, app.packagePath, app.packageName, half(0));
    let res;
    try {
      res = await native.installPackage(app.id, file.path, app.name, half(50));
    } finally {
      await native.removeFiles([file.path]).catch(() => {});
    }
    let launchPath = res.launchPath;
    if (!launchPath) {
      // Reinstalling keeps the path found the first time; otherwise ask the user.
      const previous = (await this.list()).find((r) => r.appId === app.id);
      launchPath = previous?.launchPath || (await pickInstalledExe(app.name)) || "";
    }
    if (!launchPath) {
      throw new Error(
        `Aucune application détectée après l'installation de ${app.name}. Si tu as annulé l'installateur, relance l'installation.`,
      );
    }
    const record: InstallRecord = {
      appId: app.id,
      version: app.version,
      dir: res.dir,
      launchPath,
      installedAt: new Date().toISOString(),
    };
    await (await db()).execute(
      "INSERT OR REPLACE INTO installs (app_id, version, dir, launch_path, installed_at) VALUES ($1, $2, $3, $4, $5)",
      [record.appId, record.version, record.dir, record.launchPath, record.installedAt],
    );
    return record;
  }

  async detect(apps: StoreApp[]) {
    if (!apps.length) return [];
    const paths = await native.detectInstalled(apps.map((a) => a.name));
    const conn = await db();
    const now = new Date().toISOString();
    const found: InstallRecord[] = [];
    for (const [i, app] of apps.entries()) {
      if (!paths[i]) continue;
      const record: InstallRecord = { appId: app.id, version: app.version, dir: "", launchPath: paths[i], installedAt: now };
      await conn.execute(
        "INSERT OR REPLACE INTO installs (app_id, version, dir, launch_path, installed_at) VALUES ($1, $2, $3, $4, $5)",
        [record.appId, record.version, record.dir, record.launchPath, record.installedAt],
      );
      found.push(record);
    }
    return found;
  }

  launch(record: InstallRecord) {
    return native.launch(record.launchPath);
  }

  async uninstall(app: StoreApp, record: InstallRecord) {
    if (record.dir) {
      // Extracted zip: the store owns the folder.
      await native.uninstall(app.id);
    } else {
      // Installed by its own installer: run its uninstaller, like Windows Settings does.
      const outcome = await native.systemUninstall(app.name, record.launchPath);
      if (outcome === "cancelled") throw new Error(`La désinstallation de ${app.name} a été annulée`);
    }
    await (await db()).execute("DELETE FROM installs WHERE app_id = $1", [app.id]);
  }

  reveal(record: InstallRecord) {
    return native.reveal(record.launchPath || record.dir);
  }
}

/** Plain browser (npm run dev): the catalog can be browsed but nothing can be installed. */
export class BrowserInstallService implements InstallService {
  async list() {
    return [];
  }
  async install(): Promise<InstallRecord> {
    throw new Error("L'installation n'est possible que dans l'application Nexora Store");
  }
  async launch() {}
  async uninstall() {}
  async reveal() {}
}
