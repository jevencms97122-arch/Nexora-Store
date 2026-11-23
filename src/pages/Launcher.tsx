import { getCurrentWindow } from "@tauri-apps/api/window";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { cachedApp } from "../lib/launchCache";
import { isNewerVersion } from "../lib/format";
import { native } from "../lib/native";
import { LocalInstallService } from "../providers/InstallService";
import { PocketBaseProvider } from "../providers/PocketBaseProvider";

export interface LaunchTarget {
  appId: string;
  /** Real executable, kept in the shortcut. */
  path: string;
}

const CHECK_TIMEOUT_MS = 10_000;
const OFFLINE_DELAY_S = 5;

type Phase =
  | { kind: "checking" }
  | { kind: "updating"; version: string; progress: number }
  | { kind: "starting" }
  | { kind: "offline"; seconds: number }
  | { kind: "failed"; title: string; detail: string; canLaunch: boolean };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fileStem = (p: string) => p.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || "Application";

/** Small window shown when an app is started from the desktop while the store is closed. */
export function Launcher({ target }: { target: LaunchTarget }) {
  const cached = cachedApp(target.appId);
  const [name, setName] = useState(cached?.name ?? fileStem(target.path));
  const [icon, setIcon] = useState(cached?.icon ?? "");
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const launchPath = useRef(target.path);
  const started = useRef(false);

  const start = useCallback(async () => {
    setPhase({ kind: "starting" });
    try {
      await native.launch(launchPath.current);
      await getCurrentWindow().close();
    } catch (e) {
      setPhase({ kind: "failed", title: "Lancement impossible", detail: message(e), canLaunch: false });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const installer = new LocalInstallService();
      const record = (await installer.list().catch(() => [])).find((r) => r.appId === target.appId);
      if (record?.launchPath) launchPath.current = record.launchPath;
      if (!record) return start();

      // Already running: it can't be replaced, and the user just wants its window.
      if (await native.appInUse(launchPath.current).catch(() => false)) return start();

      let app;
      try {
        app = await new PocketBaseProvider().getApp(target.appId, CHECK_TIMEOUT_MS);
      } catch {
        setPhase({ kind: "offline", seconds: OFFLINE_DELAY_S });
        return;
      }
      if (!app) return start();
      setName(app.name);
      setIcon(app.icon);
      if (app.selfUpdate || !isNewerVersion(app.version, record.version)) return start();

      const version = app.version;
      setPhase({ kind: "updating", version, progress: 0 });
      try {
        const updated = await installer.install(
          app,
          ({ done, total }) => setPhase({ kind: "updating", version, progress: total ? done / total : -1 }),
          true,
        );
        launchPath.current = updated.launchPath;
        // The installer may have recreated the desktop shortcut.
        await native.syncShortcuts([{ id: app.id, path: updated.launchPath }], false).catch(() => {});
        await start();
      } catch (e) {
        setPhase({ kind: "failed", title: "La mise à jour a échoué", detail: message(e), canLaunch: true });
      }
    })();
  }, [target, start]);

  const offlineSeconds = phase.kind === "offline" ? phase.seconds : null;
  useEffect(() => {
    if (offlineSeconds === null) return;
    if (offlineSeconds <= 0) {
      void start();
      return;
    }
    const timer = setTimeout(() => setPhase({ kind: "offline", seconds: offlineSeconds - 1 }), 1000);
    return () => clearTimeout(timer);
  }, [offlineSeconds, start]);

  const progress = phase.kind === "updating" ? phase.progress : -1;
  const showBar = phase.kind === "checking" || phase.kind === "updating" || phase.kind === "starting";

  return (
    <div data-tauri-drag-region className="flex h-full flex-col justify-between border border-line bg-surface p-6">
      <div data-tauri-drag-region className="flex items-center gap-4">
        <AppIcon name={name} icon={icon} size={60} />
        <div className="pointer-events-none min-w-0">
          <div className="truncate font-display text-lg font-semibold">{name}</div>
          <div className="mt-0.5 text-sm text-muted">
            {phase.kind === "checking" && "Recherche de mises à jour…"}
            {phase.kind === "updating" &&
              (progress >= 0 ? `Mise à jour vers la v${phase.version} : ${Math.round(progress * 100)} %` : `Installation de la v${phase.version}…`)}
            {phase.kind === "starting" && "Lancement…"}
            {phase.kind === "offline" && (
              <span className="flex items-center gap-1.5">
                <WifiOff className="size-3.5 shrink-0" /> Serveur hors connexion
              </span>
            )}
            {phase.kind === "failed" && (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" /> {phase.title}
              </span>
            )}
          </div>
        </div>
      </div>

      {showBar && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Progression">
          {progress >= 0 ? (
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
          )}
        </div>
      )}

      {phase.kind === "offline" && (
        <div>
          <p className="text-sm text-muted">
            Impossible de vérifier s'il y a une nouvelle mise à jour. Lancement dans {phase.seconds} s.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <LauncherButton onClick={() => void getCurrentWindow().close()}>Annuler</LauncherButton>
            <LauncherButton primary onClick={() => void start()}>Lancer maintenant</LauncherButton>
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <div>
          <p className="line-clamp-2 text-sm text-muted">{phase.detail}</p>
          <div className="mt-3 flex justify-end gap-2">
            <LauncherButton onClick={() => void getCurrentWindow().close()}>Fermer</LauncherButton>
            {phase.canLaunch && <LauncherButton primary onClick={() => void start()}>Lancer quand même</LauncherButton>}
          </div>
        </div>
      )}
    </div>
  );
}

function LauncherButton({ primary, onClick, children }: { primary?: boolean; onClick(): void; children: string }) {
  const look = primary ? "bg-accent text-accent-fg hover:bg-accent-hover" : "bg-surface-2 text-fg hover:bg-line";
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${look}`}>
      {children}
    </button>
  );
}
