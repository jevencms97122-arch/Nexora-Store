import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { inTauri } from "../lib/native";

export type UpdateStatus = "idle" | "checking" | "uptodate" | "available" | "downloading" | "error";

interface UpdaterValue {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  /** 0..1 while downloading, -1 when the size is unknown. */
  progress: number;
  error: string | null;
  check(): Promise<void>;
  install(): Promise<void>;
}

const Ctx = createContext<UpdaterValue | null>(null);

/** Checks the GitHub Releases for a newer Nexora Store and installs it on request. */
export function UpdaterRoot({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const update = useRef<Update | null>(null);

  const run = useCallback(async () => {
    if (!inTauri) return;
    setStatus("checking");
    setError(null);
    try {
      const found = await check();
      update.current = found;
      if (found) {
        setVersion(found.version);
        setNotes(found.body ?? null);
        setStatus("available");
      } else {
        setStatus("uptodate");
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, []);

  const install = useCallback(async () => {
    const found = update.current;
    if (!found) return;
    setStatus("downloading");
    setProgress(0);
    let total = 0;
    let done = 0;
    try {
      await found.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          done += e.data.chunkLength;
          setProgress(total ? done / total : -1);
        }
      });
      await relaunch();
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, []);

  // Silent check at startup
  useEffect(() => {
    void run();
  }, [run]);

  const value = useMemo<UpdaterValue>(
    () => ({ status, version, notes, progress, error, check: run, install }),
    [status, version, notes, progress, error, run, install],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpdater() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpdater must be used inside <UpdaterRoot>");
  return ctx;
}
