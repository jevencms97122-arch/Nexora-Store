// In-memory store used when the UI runs in a plain browser (`npm run dev`),
// so the design can be previewed without the Tauri backend.

import { newId, packageTypeOf } from "../lib/format";
import type { AppInput, InstallRecord, ProgressFn, StoreApp } from "../lib/types";
import type { InstallService, StoreProvider } from "./StoreProvider";

function art(hue: number, w: number, h: number, variant = 0): string {
  const h2 = (hue + 45) % 360;
  const shapes = [
    `<circle cx='${w * 0.78}' cy='${h * 0.28}' r='${h * 0.32}' fill='white' fill-opacity='.14'/><circle cx='${w * 0.18}' cy='${h * 0.9}' r='${h * 0.5}' fill='black' fill-opacity='.14'/>`,
    `<rect x='${w * 0.55}' y='${h * 0.15}' width='${w * 0.5}' height='${h * 0.5}' rx='${h * 0.08}' transform='rotate(18 ${w / 2} ${h / 2})' fill='white' fill-opacity='.12'/><circle cx='${w * 0.25}' cy='${h * 0.35}' r='${h * 0.18}' fill='white' fill-opacity='.18'/>`,
    `<path d='M0 ${h * 0.75} Q ${w * 0.3} ${h * 0.45} ${w * 0.55} ${h * 0.7} T ${w} ${h * 0.55} V ${h} H 0 Z' fill='black' fill-opacity='.18'/><circle cx='${w * 0.7}' cy='${h * 0.3}' r='${h * 0.12}' fill='white' fill-opacity='.5'/>`,
  ][variant % 3];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},78%,60%)'/><stop offset='1' stop-color='hsl(${h2},70%,32%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/>${shapes}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sample(
  name: string,
  kind: "game" | "app",
  category: string,
  hue: number,
  opts: Partial<StoreApp> & { shots?: number; withIcon?: boolean } = {},
): StoreApp {
  const shots = opts.shots ?? (kind === "game" ? 4 : 3);
  const daysAgo = Math.floor(Math.random() * 40);
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    id: newId(),
    name,
    developer: opts.developer ?? "Nexora Labs",
    description:
      opts.description ??
      `${name} est un exemple affiché en mode démo.\n\nLance l'application avec « npm run tauri dev » pour utiliser le vrai store local et ajouter tes propres jeux et applications.`,
    kind,
    category,
    version: opts.version ?? "1.0.0",
    packagePath: "",
    packageName: opts.packageName ?? `${name.replace(/\s+/g, "")}.zip`,
    packageSize: opts.packageSize ?? Math.round((20 + Math.random() * 900) * 1024 * 1024),
    packageType: packageTypeOf(opts.packageName ?? "x.zip") ?? "zip",
    icon: opts.withIcon === false ? "" : art(hue, 256, 256, hue % 3),
    screenshots: Array.from({ length: shots }, (_, i) => art((hue + i * 25) % 360, 1280, 720, i)),
    featured: opts.featured ?? false,
    selfUpdate: opts.selfUpdate ?? false,
    created: date,
    updated: date,
  };
}

const SAMPLES: StoreApp[] = [
  sample("Nebula Drift", "game", "racing", 255, {
    featured: true,
    developer: "Orbit Studio",
    description:
      "Des courses à toute vitesse à travers des nébuleuses aux couleurs vives.\n\nPilote ton vaisseau, enchaîne les dérapages et bats les records de tes amis.",
  }),
  sample("Hollow Peaks", "game", "adventure", 160, {
    featured: true,
    developer: "Moss & Stone",
    description: "Explore des montagnes creuses, résous des énigmes anciennes et découvre ce qui dort sous la neige.",
  }),
  sample("Pixel Forge", "game", "arcade", 20, { developer: "Tiny Anvil" }),
  sample("Iron Tactics", "game", "strategy", 210, { developer: "Grid Works" }),
  sample("Mind Maze", "game", "puzzle", 300, { withIcon: false }),
  sample("Skybound", "game", "action", 190, { developer: "Cloud Nine" }),
  sample("Notely", "app", "productivity", 45, { packageName: "NotelySetup.exe", developer: "Paper Co." }),
  sample("Waveform", "app", "media", 330, { packageName: "Waveform.msi" }),
  sample("Shell Kit", "app", "dev", 140, { developer: "Terminal Folks" }),
  sample("Canvas Pro", "app", "creative", 280, { featured: true, developer: "Brush Labs" }),
  sample("Clip Saver", "app", "tools", 100, { withIcon: false, packageName: "ClipSaver.exe" }),
];

export class DemoProvider implements StoreProvider {
  readonly id = "demo" as const;
  readonly label = "Démo (navigateur)";
  readonly canEdit = true;
  private apps = [...SAMPLES];

  async listApps() {
    return [...this.apps].sort((a, b) => b.created.localeCompare(a.created));
  }

  async saveApp(input: AppInput, existing: StoreApp | null) {
    const now = new Date().toISOString();
    const app: StoreApp = {
      ...(existing ?? sample(input.name, input.kind, input.category, Math.floor(Math.random() * 360))),
      ...input,
      created: existing?.created ?? now,
      updated: now,
    };
    this.apps = [app, ...this.apps.filter((a) => a.id !== app.id)];
    return app;
  }

  async deleteApp(app: StoreApp) {
    this.apps = this.apps.filter((a) => a.id !== app.id);
  }
}

export class DemoInstallService implements InstallService {
  private records = new Map<string, InstallRecord>();

  async list() {
    return [...this.records.values()];
  }

  install(app: StoreApp, onProgress: ProgressFn) {
    return new Promise<InstallRecord>((resolve) => {
      const total = app.packageSize;
      let done = 0;
      const timer = setInterval(() => {
        done = Math.min(total, done + total / (25 + Math.random() * 10));
        onProgress({ done, total });
        if (done >= total) {
          clearInterval(timer);
          const record: InstallRecord = {
            appId: app.id,
            version: app.version,
            dir: "",
            launchPath: "",
            installedAt: new Date().toISOString(),
          };
          this.records.set(app.id, record);
          resolve(record);
        }
      }, 80);
    });
  }

  async launch() {}

  async uninstall(app: { id: string }) {
    this.records.delete(app.id);
  }

  async reveal() {}
}
