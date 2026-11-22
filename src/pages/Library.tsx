import { AnimatePresence, motion } from "motion/react";
import { FolderOpen, Library as LibraryIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppIcon, IconPlaceholder } from "../components/AppIcon";
import { EmptyState } from "../components/EmptyState";
import { InstallButton } from "../components/InstallButton";
import { ConfirmDialog } from "../components/Modal";
import { Button, IconButton } from "../components/ui";
import { categoryName } from "../lib/categories";
import { formatBytes, formatDate, isNewerVersion } from "../lib/format";
import type { StoreApp } from "../lib/types";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";

export function Library() {
  const { apps, installs, progress, uninstall, reveal } = useStore();
  const { detail, openApp, setTab } = useNav();
  const [toRemove, setToRemove] = useState<StoreApp | null>(null);

  const installed = apps
    .filter((a) => installs[a.id] || progress[a.id] !== undefined)
    .sort((a, b) => (installs[b.id]?.installedAt ?? "~").localeCompare(installs[a.id]?.installedAt ?? "~"));
  const updates = installed.filter((a) => installs[a.id] && !a.selfUpdate && isNewerVersion(a.version, installs[a.id].version)).length;

  if (!installed.length) {
    return (
      <EmptyState
        icon={<LibraryIcon className="size-11" strokeWidth={1.6} />}
        title="Ta bibliothèque est vide"
        text="Les jeux et applications que tu installes depuis le store apparaissent ici, prêts à être lancés."
        action={
          <Button size="lg" onClick={() => setTab("store")}>
            Parcourir le store
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-8 pt-8 pb-16">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Bibliothèque</h1>
          <p className="mt-1 text-sm text-muted">
            {installed.length} élément{installed.length > 1 ? "s" : ""} installé{installed.length > 1 ? "s" : ""}
            {updates > 0 && (
              <span className="text-accent">
                {" "}
                · {updates} mise{updates > 1 ? "s" : ""} à jour disponible{updates > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {installed.map((app, i) => {
            const record = installs[app.id];
            const key = `lib:${app.id}`;
            return (
              <motion.div
                key={app.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.04 } }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                onClick={() => openApp(app.id, key)}
                className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-transparent bg-surface p-3 pr-4 transition-colors hover:border-line"
              >
                {detail?.key === key ? (
                  <IconPlaceholder size={56} />
                ) : (
                  <AppIcon name={app.name} icon={app.icon} size={56} layoutId={key} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{app.name}</div>
                  <div className="truncate text-[13px] text-muted">
                    {categoryName(app.category)} · {formatBytes(app.packageSize)}
                    {record && ` · v${record.version} · installé le ${formatDate(record.installedAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {record && (
                    <>
                      <IconButton label="Afficher dans l'explorateur" onClick={() => reveal(app)}>
                        <FolderOpen className="size-[18px]" />
                      </IconButton>
                      <IconButton label="Désinstaller" onClick={() => setToRemove(app)} className="hover:!text-red-500">
                        <Trash2 className="size-[18px]" />
                      </IconButton>
                    </>
                  )}
                  <InstallButton app={app} size="sm" className="ml-2" />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={!!toRemove}
        title="Désinstaller ?"
        message={
          <>
            <strong className="text-fg">{toRemove?.name}</strong> sera retiré de ce PC. Il reste disponible dans le store et
            tu pourras le réinstaller à tout moment.
          </>
        }
        confirmLabel="Désinstaller"
        onConfirm={() => toRemove && uninstall(toRemove)}
        onClose={() => setToRemove(null)}
      />
    </div>
  );
}
