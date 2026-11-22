// Thin typed wrappers over the Rust commands and Tauri APIs.
// Outside Tauri (plain `npm run dev` in a browser) the app falls back to a demo store.

import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { IMAGE_EXTENSIONS, PACKAGE_EXTENSIONS } from "./format";
import type { Progress, ProgressFn } from "./types";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let baseDir = "";

export async function initNative() {
  if (inTauri) baseDir = (await appDataDir()).replace(/[\\/]+$/, "");
}

/** URL an <img> can load for a data-dir-relative path (or a data:/http URL as is). */
export function fileUrl(rel: string): string {
  if (!rel) return "";
  if (/^(data:|https?:|blob:)/.test(rel) || !inTauri) return rel;
  return convertFileSrc(`${baseDir}\\${rel.replace(/\//g, "\\")}`);
}

export interface FileInfo {
  name: string;
  size: number;
  extension: string;
}

export interface StoredFile {
  path: string;
  name: string;
  size: number;
}

export interface InstallResult {
  dir: string;
  launchPath: string;
}

function channel(onProgress: ProgressFn) {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return ch;
}

export const native = {
  fileInfo: (path: string) => invoke<FileInfo>("file_info", { path }),
  stageImage: (src: string) => invoke<StoredFile>("stage_image", { src }),
  importPackage: (appId: string, src: string, onProgress: ProgressFn) =>
    invoke<StoredFile>("import_package", { appId, src, onProgress: channel(onProgress) }),
  commitImages: (appId: string, paths: string[]) => invoke<string[]>("commit_images", { appId, paths }),
  removeFiles: (paths: string[]) => invoke<void>("remove_files", { paths }),
  installPackage: (appId: string, packagePath: string, appName: string, onProgress: ProgressFn) =>
    invoke<InstallResult>("install_package", { appId, packagePath, appName, onProgress: channel(onProgress) }),
  detectInstalled: (names: string[]) => invoke<string[]>("detect_installed", { names }),
  launch: (path: string) => invoke<void>("launch_path", { path }),
  reveal: (path = "") => invoke<void>("reveal", { path }),
  uninstall: (appId: string) => invoke<void>("uninstall", { appId }),
  systemUninstall: (appName: string, launchPath: string) =>
    invoke<"done" | "cancelled" | "notfound">("system_uninstall", { appName, launchPath }),
  deleteAppFiles: (appId: string) => invoke<void>("delete_app_files", { appId }),
};

// ---------------------------------------------------------------------------
// File pickers
// ---------------------------------------------------------------------------

export async function pickPackage(): Promise<string | null> {
  if (!inTauri) return null;
  const res = await open({
    multiple: false,
    directory: false,
    title: "Choisir l'application",
    filters: [{ name: "Applications et jeux", extensions: PACKAGE_EXTENSIONS }],
  });
  return typeof res === "string" ? res : null;
}

/** Asks the user for the executable an installer put on their PC (when it can't be detected). */
export async function pickInstalledExe(appName: string): Promise<string | null> {
  if (!inTauri) return null;
  const res = await open({
    multiple: false,
    directory: false,
    title: `Sélectionne ${appName} installé (fichier .exe)`,
    defaultPath: "C:\\Program Files",
    filters: [{ name: "Application", extensions: ["exe"] }],
  });
  return typeof res === "string" ? res : null;
}

export async function pickImages(multiple: boolean): Promise<string[]> {
  if (!inTauri) return [];
  const res = await open({
    multiple,
    directory: false,
    title: multiple ? "Choisir des captures d'écran" : "Choisir une icône",
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  });
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}

// ---------------------------------------------------------------------------
// Native drag & drop (gives real file paths, unlike HTML5 drop)
// ---------------------------------------------------------------------------

export interface FileDropEvent {
  type: "enter" | "over" | "leave" | "drop";
  paths: string[];
  /** CSS pixels, relative to the window. */
  x: number;
  y: number;
}

type DropHandler = (e: FileDropEvent) => void;

const dropHandlers: DropHandler[] = [];
let dropListening = false;

/** Subscribes to file drops. Only the most recent subscriber receives events. */
export function onFileDrop(handler: DropHandler): () => void {
  dropHandlers.push(handler);
  void listenDrops();
  return () => {
    const i = dropHandlers.lastIndexOf(handler);
    if (i >= 0) dropHandlers.splice(i, 1);
  };
}

async function listenDrops() {
  if (dropListening || !inTauri) return;
  dropListening = true;
  let current: string[] = [];
  await getCurrentWebview().onDragDropEvent(({ payload }) => {
    const scale = window.devicePixelRatio || 1;
    const pos = "position" in payload ? payload.position : { x: 0, y: 0 };
    if ("paths" in payload) current = payload.paths;
    const event: FileDropEvent = {
      type: payload.type,
      paths: payload.type === "leave" ? [] : current,
      x: pos.x / scale,
      y: pos.y / scale,
    };
    dropHandlers[dropHandlers.length - 1]?.(event);
  });
}

/** The `data-dropzone` value of the element under a drop position. */
export function dropzoneAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dropzone]");
  return el?.dataset.dropzone ?? null;
}
