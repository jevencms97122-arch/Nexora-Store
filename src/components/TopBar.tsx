import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "motion/react";
import { Copy, Minus, Plus, RefreshCw, Search, Settings, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { inTauri } from "../lib/native";
import { useNav, type Tab } from "../state/nav";
import { useStore } from "../state/store";
import { useUpdater } from "../state/updater";
import { Button, IconButton } from "./ui";

const TABS: { id: Tab; label: string }[] = [
  { id: "store", label: "Découvrir" },
  { id: "library", label: "Bibliothèque" },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5" data-tauri-drag-region>
      <svg viewBox="0 0 160 160" className="size-8 shrink-0" aria-hidden="true">
        <rect width="160" height="160" rx="36" fill="#4263EB" />
        <polygon points="80,26 126,53 126,107 80,134 34,107 34,53" fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
        <path d="M80 50V104M58 82L80 106L102 82" fill="none" stroke="#4263EB" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight" data-tauri-drag-region>
        Nexora
      </span>
    </div>
  );
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const sync = () => win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    win.onResized(sync).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  if (!inTauri) return null;
  const win = getCurrentWindow();
  const btn = "grid h-full w-[46px] place-items-center text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="-mr-4 ml-2 flex h-full self-stretch">
      <button aria-label="Réduire" className={btn} onClick={() => win.minimize()}>
        <Minus className="size-4" />
      </button>
      <button aria-label={maximized ? "Restaurer" : "Agrandir"} className={btn} onClick={() => win.toggleMaximize()}>
        {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
      </button>
      <button aria-label="Fermer" className={`${btn} hover:!bg-red-500 hover:!text-white`} onClick={() => win.close()}>
        <X className="size-4" />
      </button>
    </div>
  );
}

export function TopBar() {
  const { tab, setTab, query, setQuery, openForm, setSettingsOpen, closeApp } = useNav();
  const { provider } = useStore();
  const updater = useUpdater();
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K / Ctrl+F focus the search field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="relative z-40 flex h-16 shrink-0 items-center gap-6 border-b border-line/70 bg-bg/80 px-4 pl-6 backdrop-blur-xl"
    >
      <Logo />

      <nav className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = tab === t.id && !query;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative h-9 rounded-full px-4 text-sm font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-fg"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-accent-soft"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-1 justify-center" data-tauri-drag-region>
        <label className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-full bg-surface-2 px-4 ring-accent/40 transition-[box-shadow,background-color] focus-within:bg-surface focus-within:ring-2">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              closeApp();
            }}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), input.current?.blur())}
            placeholder="Rechercher des jeux et des apps"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {query ? (
            <button aria-label="Effacer" onClick={() => setQuery("")} className="text-muted hover:text-fg">
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">Ctrl K</kbd>
          )}
        </label>
      </div>

      <div className="flex items-center gap-1.5 self-stretch">
        {(updater.status === "available" || updater.status === "downloading") && (
          <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)} className="h-9 px-4 text-accent">
            <RefreshCw className="size-4" /> Mise à jour disponible
          </Button>
        )}
        {provider.canEdit && (
          <Button size="sm" onClick={() => openForm(null)} className="h-9 px-4">
            <Plus className="size-4" /> Ajouter
          </Button>
        )}
        <IconButton label="Paramètres" onClick={() => setSettingsOpen(true)}>
          <Settings className="size-[18px]" />
        </IconButton>
        <WindowControls />
      </div>
    </header>
  );
}
