import Database from "@tauri-apps/plugin-sql";
import { newId, packageTypeOf } from "../lib/format";
import { native, pickInstalledExe } from "../lib/native";
import type { AppInput, InstallRecord, ProgressFn, StoreApp } from "../lib/types";
import type { InstallService, StoreProvider } from "./StoreProvider";

let dbPromise: Promise<Database> | null = null;
const db = () => (dbPromise ??= Database.load("sqlite:nexora.db"));

interface AppRow {
  id: string;
  name: string;
  developer: string;
  description: string;
  kind: string;
  category: string;
  version: string;
  package_path: string;
  package_name: string;
  package_size: number;
  package_type: string;
  icon: string;
  screenshots: string;
  featured: number;
  self_update: number;
  created: string;
  updated: string;
}

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const fromRow = (r: AppRow): StoreApp => ({
  id: r.id,
  name: r.name,
  developer: r.developer,
  description: r.description,
  kind: r.kind === "app" ? "app" : "game",
  category: r.category,
  version: r.version,
  packagePath: r.package_path,
  packageName: r.package_name,
  packageSize: r.package_size,
  packageType: packageTypeOf(r.package_name) ?? "exe",
  icon: r.icon,
  screenshots: parseList(r.screenshots),
  featured: !!r.featured,
  selfUpdate: !!r.self_update,
  created: r.created,
  updated: r.updated,
});

/** Catalog stored in SQLite, files in `%APPDATA%/com.nexora.store/library`. */
export class LocalProvider implements StoreProvider {
  readonly id = "local" as const;
  readonly label = "Local (ce PC)";
  readonly canEdit = true;

  async listApps() {
    const rows = await (await db()).select<AppRow[]>("SELECT * FROM apps ORDER BY created DESC");
    return rows.map(fromRow);
  }

  async saveApp(input: AppInput, existing: StoreApp | null, onProgress: ProgressFn = () => {}) {
    const id = existing?.id ?? newId();
    const now = new Date().toISOString();
    const obsolete: string[] = [];

    let pkg = existing ? { path: existing.packagePath, name: existing.packageName, size: existing.packageSize } : null;
    if (input.packageSource) {
      const stored = await native.importPackage(id, input.packageSource, onProgress);
      if (pkg) obsolete.push(pkg.path);
      pkg = stored;
    }
    if (!pkg) throw new Error("Choisis le fichier de l'application (.exe, .msi ou .zip)");

    const [icon, ...screenshots] = await native.commitImages(id, [input.icon, ...input.screenshots]);
    if (existing) {
      const kept = new Set([icon, ...screenshots]);
      obsolete.push(...[existing.icon, ...existing.screenshots].filter((p) => p && !kept.has(p)));
    }

    const app: StoreApp = {
      id,
      name: input.name.trim(),
      developer: input.developer.trim(),
      description: input.description.trim(),
      kind: input.kind,
      category: input.category,
      version: input.version.trim() || "1.0",
      packagePath: pkg.path,
      packageName: pkg.name,
      packageSize: pkg.size,
      packageType: packageTypeOf(pkg.name) ?? "exe",
      icon,
      screenshots,
      featured: input.featured,
      selfUpdate: input.selfUpdate,
      created: existing?.created ?? now,
      updated: now,
    };

    await (await db()).execute(
      `INSERT OR REPLACE INTO apps
        (id, name, developer, description, kind, category, version, package_path, package_name,
         package_size, package_type, icon, screenshots, featured, self_update, created, updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        app.id,
        app.name,
        app.developer,
        app.description,
        app.kind,
        app.category,
        app.version,
        app.packagePath,
        app.packageName,
        app.packageSize,
        app.packageType,
        app.icon,
        JSON.stringify(app.screenshots),
        app.featured ? 1 : 0,
        app.selfUpdate ? 1 : 0,
        app.created,
        app.updated,
      ],
    );
    if (obsolete.length) await native.removeFiles(obsolete);
    return app;
  }

  async deleteApp(app: StoreApp) {
    await native.deleteAppFiles(app.id);
    const conn = await db();
    await conn.execute("DELETE FROM installs WHERE app_id = $1", [app.id]);
    await conn.execute("DELETE FROM apps WHERE id = $1", [app.id]);
  }
}

interface InstallRow {
  app_id: string;
  version: string;
  dir: string;
  launch_path: string;
  installed_at: string;
}

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
    const res = await native.installPackage(app.id, app.packagePath, app.name, onProgress);
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
