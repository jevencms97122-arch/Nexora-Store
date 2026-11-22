import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppCard, Shot } from "../components/AppCard";
import { AppIcon } from "../components/AppIcon";
import { InstallButton } from "../components/InstallButton";
import { ConfirmDialog } from "../components/Modal";
import { Row } from "../components/Row";
import { Button, IconButton } from "../components/ui";
import { categoryName, KIND_LABEL } from "../lib/categories";
import { formatBytes, formatDate, PACKAGE_LABEL } from "../lib/format";
import { fileUrl } from "../lib/native";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";

const ease = [0.22, 1, 0.36, 1] as const;

function Section({ delay, children, className = "" }: { delay: number; children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, delay, ease }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 first:pl-0">
      <div className="text-[15px] font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function AppDetail({ id, layoutKey }: { id: string; layoutKey: string }) {
  const { apps, installs, provider, uninstall, reveal, deleteApp } = useStore();
  const { closeApp, openForm } = useNav();
  const [confirm, setConfirm] = useState<"delete" | "uninstall" | null>(null);
  const [shot, setShot] = useState<number | null>(null);

  const app = apps.find((a) => a.id === id);
  const record = app ? installs[app.id] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) closeApp();
    };
    const onMouse = (e: MouseEvent) => e.button === 3 && closeApp(); // mouse "back" button
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, [closeApp]);

  useEffect(() => {
    if (!app) closeApp();
  }, [app, closeApp]);

  if (!app) return null;

  const similar = apps.filter((a) => a.id !== app.id && a.kind === app.kind && a.category === app.category);
  const others = similar.length ? similar : apps.filter((a) => a.id !== app.id && a.kind === app.kind).slice(0, 12);

  const infos: [string, string][] = [
    ["Version", app.version],
    ["Taille", formatBytes(app.packageSize)],
    ["Format", PACKAGE_LABEL[app.packageType]],
    ["Fichier", app.packageName || "—"],
    ["Catégorie", categoryName(app.category)],
    ["Ajouté le", formatDate(app.created)],
    ["Mis à jour le", formatDate(app.updated)],
    ["Mises à jour", app.selfUpdate ? "Automatiques (intégrées à l'application)" : "Via le store"],
    ...(record ? ([["Installé le", formatDate(record.installedAt)]] as [string, string][]) : []),
  ];

  return (
    <motion.div className="absolute inset-0 z-30" exit={{ pointerEvents: "none" }}>
      <motion.div
        className="absolute inset-0 bg-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div layoutScroll className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-10 pt-5 pb-20">
          <Section delay={0}>
            <button
              onClick={closeApp}
              className="-ml-3 flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ArrowLeft className="size-4" /> Retour
            </button>
          </Section>

          <div className="mt-5 flex items-start gap-8">
            <AppIcon name={app.name} icon={app.icon} size={136} layoutId={layoutKey} className="shadow-xl shadow-black/10" />
            <Section delay={0.06} className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="font-display text-4xl font-semibold tracking-tight">{app.name}</h1>
                {app.selfUpdate && (
                  <span className="inline-flex translate-y-[3px] items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                    <RefreshCw className="size-3.5" /> Mises à jour automatiques
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-accent">{app.developer || "Développeur inconnu"}</p>

              <div className="mt-5 flex divide-x divide-line">
                <Stat label={KIND_LABEL[app.kind]} value={categoryName(app.category)} />
                <Stat label="Taille" value={formatBytes(app.packageSize)} />
                <Stat label="Version" value={app.version} />
                {record && <Stat label="Statut" value="Installé" />}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <InstallButton app={app} size="lg" />
                {record && (
                  <>
                    <Button variant="secondary" size="lg" onClick={() => setConfirm("uninstall")}>
                      Désinstaller
                    </Button>
                    <IconButton label="Afficher dans l'explorateur" onClick={() => reveal(app)} className="size-12">
                      <FolderOpen className="size-5" />
                    </IconButton>
                  </>
                )}
                {provider.canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton label="Modifier" onClick={() => openForm(app)}>
                      <Pencil className="size-[18px]" />
                    </IconButton>
                    <IconButton label="Supprimer du store" onClick={() => setConfirm("delete")} className="hover:!text-red-500">
                      <Trash2 className="size-[18px]" />
                    </IconButton>
                  </div>
                )}
              </div>
            </Section>
          </div>

          {app.screenshots.length > 0 && (
            <Section delay={0.12} className="mt-10">
              <div className="no-scrollbar -mx-10 flex snap-x gap-4 overflow-x-auto px-10 pb-2" style={{ scrollPaddingInline: 40 }}>
                {app.screenshots.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setShot(i)}
                    className="group h-[260px] shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-2"
                    style={{ aspectRatio: "16 / 9" }}
                  >
                    <Shot src={s} name={app.name} className="transition-transform duration-500 group-hover:scale-[1.03]" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section delay={0.18} className="mt-10 grid grid-cols-[1fr_300px] gap-10">
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold">À propos</h2>
              <p className="selectable text-[15px] leading-relaxed whitespace-pre-line text-fg/85">
                {app.description || "Aucune description pour le moment."}
              </p>
            </div>
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold">Informations</h2>
              <dl className="divide-y divide-line rounded-2xl bg-surface px-4">
                {infos.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2.5 text-[13px]">
                    <dt className="text-muted">{k}</dt>
                    <dd className="selectable truncate text-right font-medium" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Section>

          {others.length > 0 && (
            <Section delay={0.24} className="-mx-10 mt-12">
              <Row title={similar.length ? "Dans la même catégorie" : "Tu aimeras peut-être"} gutter={40}>
                {others.map((a, i) => (
                  <AppCard key={a.id} app={a} variant="banner" scope={`similar-${app.id}`} index={i} />
                ))}
              </Row>
            </Section>
          )}
        </div>
      </motion.div>

      <Lightbox shots={app.screenshots} name={app.name} index={shot} onIndex={setShot} />

      <ConfirmDialog
        open={confirm === "uninstall"}
        title="Désinstaller ?"
        message={
          <>
            <strong className="text-fg">{app.name}</strong> sera retiré de ce PC. Il reste disponible dans le store.
          </>
        }
        confirmLabel="Désinstaller"
        onConfirm={() => uninstall(app)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Supprimer du store ?"
        message={
          <>
            <strong className="text-fg">{app.name}</strong>, ses images, son fichier et son installation éventuelle seront
            définitivement supprimés de ce PC. Cette action est irréversible.
          </>
        }
        confirmLabel="Supprimer"
        onConfirm={() => deleteApp(app)}
        onClose={() => setConfirm(null)}
      />
    </motion.div>
  );
}

function Lightbox({
  shots,
  name,
  index,
  onIndex,
}: {
  shots: string[];
  name: string;
  index: number | null;
  onIndex(i: number | null): void;
}) {
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      else if (e.key === "ArrowRight") onIndex((index + 1) % shots.length);
      else if (e.key === "ArrowLeft") onIndex((index - 1 + shots.length) % shots.length);
      else return;
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, shots.length, onIndex]);

  const nav = "absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20";

  return createPortal(
    <AnimatePresence>
      {index !== null && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onIndex(null)}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={shots[index]}
              src={fileUrl(shots[index])}
              alt={`${name}, capture ${index + 1}`}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-h-[84vh] max-w-[86vw] rounded-2xl object-contain shadow-2xl"
            />
          </AnimatePresence>
          <button aria-label="Fermer" className="absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="size-5" />
          </button>
          {shots.length > 1 && (
            <>
              <button
                aria-label="Précédente"
                className={`${nav} left-6`}
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex((index - 1 + shots.length) % shots.length);
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                aria-label="Suivante"
                className={`${nav} right-6`}
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex((index + 1) % shots.length);
                }}
              >
                <ChevronRight className="size-6" />
              </button>
              <div className="absolute bottom-6 rounded-full bg-white/10 px-3 py-1 text-xs text-white tabular-nums backdrop-blur">
                {index + 1} / {shots.length}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
