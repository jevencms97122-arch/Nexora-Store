import { POCKETBASE_URL } from "../lib/config";
import { normalizeCategory } from "../lib/categories";
import { inTauri, native } from "../lib/native";
import type { AppInput, PackageType, ProgressFn, StoreApp } from "../lib/types";
import type { StoreProvider } from "./StoreProvider";

const TOKEN_KEY = "nexora.admin-token";
const COLLECTION = "apps";

interface PbRecord {
  id: string;
  name: string;
  developer: string;
  description: string;
  kind: string;
  category: string;
  version: string;
  featured: boolean;
  selfUpdate: boolean;
  icon: string;
  screenshots: string[];
  package: string;
  created: string;
  updated: string;
}

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

const writeToken = (t: string) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session just won't persist */
  }
};

/** PocketBase appends `_xxxxxxxxxx` to uploaded file names; show the original name. */
const originalName = (stored: string) => stored.replace(/_[a-z0-9]{10}(\.[^.]+)?$/i, "$1");

/** Size of a file on the server, without downloading it. */
async function remoteSize(url: string): Promise<number> {
  if (!url) return 0;
  try {
    const head = await fetch(url, { method: "HEAD" });
    const len = Number(head.headers.get("content-length"));
    if (head.ok && len > 0) return len;
    const part = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = Number(part.headers.get("content-range")?.split("/")[1]);
    return total > 0 ? total : 0;
  } catch {
    return 0;
  }
}

const isUrl = (s: string) => /^https?:/.test(s);
const fileOf = (url: string) => decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");

function packageTypeOf(name: string): PackageType {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "msi" || ext === "zip" ? ext : "exe";
}

async function request<T>(path: string, init: RequestInit = {}, token = ""): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${POCKETBASE_URL}${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: token } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error("Serveur PocketBase injoignable. Vérifie ta connexion.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && path.includes(`/collections/${COLLECTION}/`)) {
      throw new Error("La collection « apps » n'existe pas sur le serveur (importe pocketbase/collections.json).");
    }
    throw new Error(body?.message || `Erreur du serveur (${res.status})`);
  }
  return body as T;
}

export class PocketBaseProvider implements StoreProvider {
  readonly id = "pocketbase" as const;
  readonly label = "Serveur PocketBase";
  readonly url = POCKETBASE_URL;
  private token = readToken();

  get canEdit() {
    return !!this.token && inTauri;
  }

  async restore() {
    if (!this.token) return;
    try {
      const res = await request<{ token: string }>(
        "/api/collections/_superusers/auth-refresh",
        { method: "POST" },
        this.token,
      );
      this.token = res.token;
      writeToken(this.token);
    } catch {
      this.token = "";
      writeToken("");
    }
  }

  async login(email: string, password: string) {
    const res = await request<{ token: string }>("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    }).catch((e) => {
      throw new Error(e instanceof Error && e.message.includes("injoignable") ? e.message : "Identifiants incorrects");
    });
    this.token = res.token;
    writeToken(this.token);
  }

  logout() {
    this.token = "";
    writeToken("");
  }

  private fileUrl(r: { id: string }, file: string) {
    return file ? `${POCKETBASE_URL}/api/files/${COLLECTION}/${r.id}/${encodeURIComponent(file)}` : "";
  }

  private toApp(r: PbRecord, packageSize = 0): StoreApp {
    return {
      id: r.id,
      name: r.name,
      developer: r.developer ?? "",
      description: r.description ?? "",
      kind: r.kind === "app" ? "app" : "game",
      category: normalizeCategory(r.category),
      version: r.version || "1.0",
      packagePath: this.fileUrl(r, r.package),
      packageName: originalName(r.package),
      packageSize,
      packageType: packageTypeOf(r.package),
      icon: this.fileUrl(r, r.icon),
      screenshots: (r.screenshots ?? []).map((f) => this.fileUrl(r, f)),
      featured: !!r.featured,
      selfUpdate: !!r.selfUpdate,
      created: r.created,
      updated: r.updated,
    };
  }

  async listApps() {
    const out: StoreApp[] = [];
    for (let page = 1; ; page++) {
      const res = await request<{ items: PbRecord[]; totalPages: number }>(
        `/api/collections/${COLLECTION}/records?perPage=200&page=${page}&sort=-created`,
      );
      const sizes = await Promise.all(res.items.map((r) => remoteSize(this.fileUrl(r, r.package))));
      out.push(...res.items.map((r, i) => this.toApp(r, sizes[i])));
      if (page >= res.totalPages) return out;
    }
  }

  async saveApp(input: AppInput, existing: StoreApp | null, onProgress: ProgressFn = () => {}) {
    if (!this.token) throw new Error("Connecte-toi en administrateur dans les paramètres");
    if (!inTauri) throw new Error("L'ajout de fichiers n'est possible que dans l'application Nexora Store");
    if (!existing && !input.packageSource) throw new Error("Choisis le fichier de l'application (.exe, .msi ou .zip)");

    const fields: [string, string][] = [
      ["name", input.name.trim()],
      ["developer", input.developer.trim()],
      ["description", input.description.trim()],
      ["kind", input.kind],
      ["category", input.category],
      ["version", input.version.trim() || "1.0"],
      ["featured", String(input.featured)],
      ["selfUpdate", String(input.selfUpdate)],
    ];
    const files: { field: string; path: string }[] = [];

    if (input.packageSource) {
      files.push({ field: "package", path: input.packageSource });
    }

    // Icon: a staged file is uploaded, an emptied icon is cleared, a URL is left alone.
    if (input.icon && !isUrl(input.icon)) files.push({ field: "icon", path: input.icon });
    else if (!input.icon && existing?.icon) fields.push(["icon", ""]);

    // Screenshots: new staged files are appended, removed ones are deleted by name.
    const kept = new Set(input.screenshots.filter(isUrl).map(fileOf));
    for (const s of input.screenshots) if (!isUrl(s)) files.push({ field: "screenshots", path: s });
    for (const s of existing?.screenshots ?? []) if (!kept.has(fileOf(s))) fields.push(["screenshots-", fileOf(s)]);

    const record = await native.pbSave(POCKETBASE_URL, this.token, existing?.id ?? null, fields, files, onProgress);
    const saved = JSON.parse(record) as PbRecord;
    return this.toApp(saved, await remoteSize(this.fileUrl(saved, saved.package)));
  }

  async deleteApp(app: StoreApp) {
    if (!this.token) throw new Error("Connecte-toi en administrateur dans les paramètres");
    await request(`/api/collections/${COLLECTION}/records/${app.id}`, { method: "DELETE" }, this.token);
    if (inTauri) await native.deleteAppFiles(app.id).catch(() => {});
  }
}
