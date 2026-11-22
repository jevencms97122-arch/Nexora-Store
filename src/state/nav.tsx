import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { StoreApp } from "../lib/types";

export type Tab = "store" | "library";

interface Detail {
  id: string;
  /** layoutId shared by the clicked icon and the detail page icon. */
  key: string;
}

export interface FormState {
  app: StoreApp | null;
  /** Files dropped on the window that opened the form. */
  files: string[];
  /** Changes on every opening so the form starts fresh. */
  nonce: number;
}

interface NavValue {
  tab: Tab;
  setTab(tab: Tab): void;
  query: string;
  setQuery(q: string): void;
  detail: Detail | null;
  openApp(id: string, key: string): void;
  closeApp(): void;
  form: FormState | null;
  openForm(app?: StoreApp | null, files?: string[]): void;
  closeForm(): void;
  settingsOpen: boolean;
  setSettingsOpen(open: boolean): void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavRoot({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>("store");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    setQuery("");
    setDetail(null);
  }, []);

  const value = useMemo<NavValue>(
    () => ({
      tab,
      setTab,
      query,
      setQuery,
      detail,
      openApp: (id, key) => setDetail({ id, key }),
      closeApp: () => setDetail(null),
      form,
      openForm: (app = null, files = []) => setForm({ app, files, nonce: Date.now() }),
      closeForm: () => setForm(null),
      settingsOpen,
      setSettingsOpen,
    }),
    [tab, setTab, query, detail, form, settingsOpen],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used inside <NavRoot>");
  return ctx;
}
