import { AnimatePresence, motion } from "motion/react";
import { Download, Play, RefreshCw } from "lucide-react";
import { isNewerVersion } from "../lib/format";
import type { StoreApp } from "../lib/types";
import { useStore } from "../state/store";

interface Props {
  app: StoreApp;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "h-8 min-w-[92px] px-3.5 text-[13px]",
  md: "h-10 min-w-[120px] px-5 text-sm",
  lg: "h-12 min-w-[200px] px-7 text-[15px]",
};

/** Installer → progress → Ouvrir (or Mettre à jour when the store has a newer version). */
export function InstallButton({ app, size = "md", className = "" }: Props) {
  const { installs, progress, install, launch } = useStore();
  const record = installs[app.id];
  const p = progress[app.id];
  const installing = p !== undefined;
  const outdated = !!record && !app.selfUpdate && isNewerVersion(app.version, record.version);

  const state = installing ? "installing" : record ? (outdated ? "update" : "open") : "install";
  const label = {
    installing: (p ?? 0) < 0 ? "Installation…" : `${Math.round((p ?? 0) * 100)} %`,
    update: "Mettre à jour",
    open: "Ouvrir",
    install: "Installer",
  }[state];
  const icon = {
    installing: null,
    update: <RefreshCw className="size-4" />,
    open: <Play className="size-4 fill-current" />,
    install: <Download className="size-4" />,
  }[state];

  return (
    <motion.button
      layout
      type="button"
      disabled={installing}
      onClick={(e) => {
        e.stopPropagation();
        if (state === "open") void launch(app);
        else void install(app);
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={`relative isolate inline-flex items-center justify-center overflow-hidden rounded-full font-semibold transition-colors active:scale-[0.97] ${
        installing ? "bg-accent-soft text-accent" : "bg-accent text-accent-fg hover:bg-accent-hover"
      } ${SIZES[size]} ${className}`}
    >
      {installing && (
        <motion.span
          className="absolute inset-y-0 left-0 -z-10 bg-accent/25"
          initial={{ width: 0 }}
          animate={
            (p ?? 0) < 0 ? { width: "100%", opacity: [0.3, 1, 0.3] } : { width: `${(p ?? 0) * 100}%`, opacity: 1 }
          }
          transition={(p ?? 0) < 0 ? { duration: 1.6, repeat: Infinity } : { ease: "easeOut", duration: 0.25 }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          className="flex items-center gap-2 tabular-nums"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
        >
          {icon}
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
