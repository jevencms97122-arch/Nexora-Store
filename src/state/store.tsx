import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { inTauri } from "../lib/native";
import type { AppInput, InstallRecord, ProgressFn, StoreApp } from "../lib/types";
import { DemoInstallService, DemoProvider } from "../providers/DemoProvider";
import { LocalInstallService, LocalProvider } from "../providers/LocalProvider";
import type { InstallService, StoreProvider } from "../providers/StoreProvider";
import { useToast } from "./toast";

interface StoreValue {
  ready: boolean;
  error: string | null;
  provider: StoreProvider;
  apps: StoreApp[];
  installs: Record<string, InstallRecord>;
  /** 0..1 for apps being installed right now. */
  progress: Record<string, number>;
  saveApp(input: AppInput, existing: StoreApp | null, onProgress?: ProgressFn): Promise<StoreApp>;
  deleteApp(app: StoreApp): Promise<void>;
  install(app: StoreApp): Promise<void>;
  launch(app: StoreApp): Promise<void>;
  uninstall(app: StoreApp): Promise<void>;
  reveal(app: StoreApp): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function StoreProviderRoot({ children }: { children: ReactNode }) {
  const toast = useToast();
  const services = useRef<{ provider: StoreProvider; installer: InstallService }>(
    inTauri
      ? { provider: new LocalProvider(), installer: new LocalInstallService() }
      : { provider: new DemoProvider(), installer: new DemoInstallService() },
  ).current;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<StoreApp[]>([]);
  const [installs, setInstalls] = useState<Record<string, InstallRecord>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const [list, records] = await Promise.all([services.provider.listApps(), services.installer.list()]);
    setApps(list);
    setInstalls(Object.fromEntries(records.map((r) => [r.appId, r])));
    return { list, records };
  }, [services]);

  // Apps already on this PC (installed outside the store, or whose record was lost) are
  // recognised automatically, without blocking the first display.
  const detect = useCallback(
    async (list: StoreApp[], records: InstallRecord[]) => {
      if (!services.installer.detect) return;
      const known = new Set(records.map((r) => r.appId));
      const found = await services.installer.detect(list.filter((a) => !known.has(a.id)));
      if (found.length) setInstalls((r) => ({ ...Object.fromEntries(found.map((f) => [f.appId, f])), ...r }));
    },
    [services],
  );

  useEffect(() => {
    refresh()
      .then(({ list, records }) => void detect(list, records).catch(() => {}))
      .catch((e) => setError(message(e)))
      .finally(() => setReady(true));
  }, [refresh, detect]);

  const saveApp = useCallback(
    async (input: AppInput, existing: StoreApp | null, onProgress?: ProgressFn) => {
      const app = await services.provider.saveApp(input, existing, onProgress);
      setApps((list) => [app, ...list.filter((a) => a.id !== app.id)].sort((a, b) => b.created.localeCompare(a.created)));
      return app;
    },
    [services],
  );

  const deleteApp = useCallback(
    async (app: StoreApp) => {
      try {
        await services.provider.deleteApp(app);
        setApps((list) => list.filter((a) => a.id !== app.id));
        setInstalls(({ [app.id]: _, ...rest }) => rest);
        toast(`${app.name} a été supprimé du store`);
      } catch (e) {
        toast(message(e), "error");
      }
    },
    [services, toast],
  );

  const install = useCallback(
    async (app: StoreApp) => {
      const updating = !!installs[app.id];
      setProgress((p) => ({ ...p, [app.id]: 0 }));
      try {
        const record = await services.installer.install(app, ({ done, total }) =>
          setProgress((p) => ({ ...p, [app.id]: total ? done / total : -1 })),
        );
        setInstalls((r) => ({ ...r, [app.id]: record }));
        toast(updating ? `${app.name} est à jour (v${app.version})` : `${app.name} est installé`, "success");
      } catch (e) {
        toast(message(e), "error");
      } finally {
        setProgress(({ [app.id]: _, ...rest }) => rest);
      }
    },
    [services, toast, installs],
  );

  const launch = useCallback(
    async (app: StoreApp) => {
      const record = installs[app.id];
      if (!record) return;
      try {
        await services.installer.launch(record);
        if (!inTauri) toast(`${app.name} se lancerait ici (mode démo)`);
      } catch (e) {
        toast(message(e), "error");
      }
    },
    [installs, services, toast],
  );

  const uninstall = useCallback(
    async (app: StoreApp) => {
      const record = installs[app.id];
      if (!record) return;
      try {
        if (!record.dir) toast(`Désinstallation de ${app.name}…`);
        await services.installer.uninstall(app, record);
        setInstalls(({ [app.id]: _, ...rest }) => rest);
        toast(`${app.name} a été désinstallé`);
      } catch (e) {
        toast(message(e), "error");
      }
    },
    [installs, services, toast],
  );

  const reveal = useCallback(
    async (app: StoreApp) => {
      const record = installs[app.id];
      if (record) await services.installer.reveal(record).catch((e) => toast(message(e), "error"));
    },
    [installs, services, toast],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      error,
      provider: services.provider,
      apps,
      installs,
      progress,
      saveApp,
      deleteApp,
      install,
      launch,
      uninstall,
      reveal,
    }),
    [ready, error, services, apps, installs, progress, saveApp, deleteApp, install, launch, uninstall, reveal],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProviderRoot>");
  return ctx;
}
