import { AnimatePresence, motion } from "motion/react";
import { FileArchive, ImagePlus, Loader2, Plus, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppIcon } from "../components/AppIcon";
import { Modal, ModalFooter, ModalHeader } from "../components/Modal";
import { Button, Segmented, Switch } from "../components/ui";
import { categoriesOf } from "../lib/categories";
import { formatBytes, isImagePath, isPackagePath, PACKAGE_LABEL, packageTypeOf } from "../lib/format";
import { dropzoneAt, fileUrl, inTauri, native, onFileDrop, pickImages, pickPackage } from "../lib/native";
import type { AppKind } from "../lib/types";
import { useNav, type FormState } from "../state/nav";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";

/** Keeps the modal mounted so it can animate out, and gives each opening a fresh form. */
export function AppFormHost() {
  const { form, closeForm } = useNav();
  const [saving, setSaving] = useState(false);
  const last = useRef<FormState | null>(form);
  if (form) last.current = form;

  return (
    <Modal open={!!form} onClose={closeForm} locked={saving} width="max-w-4xl" bare>
      {last.current && (
        <AppForm key={last.current.nonce} state={last.current} saving={saving} setSaving={setSaving} onClose={closeForm} />
      )}
    </Modal>
  );
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** "super_game-v1.2.zip" → "Super game v1.2" */
function guessName(fileName: string) {
  const s = fileName.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface PackageState {
  source?: string;
  name: string;
  size: number;
}

interface Props {
  state: FormState;
  saving: boolean;
  setSaving(v: boolean): void;
  onClose(): void;
}

const MAX_SHOTS = 10;

function AppForm({ state, saving, setSaving, onClose }: Props) {
  const { saveApp } = useStore();
  const { setTab, openApp } = useNav();
  const toast = useToast();
  const app = state.app;

  const startKind: AppKind = app?.kind ?? "game";
  const [name, setName] = useState(app?.name ?? "");
  const [developer, setDeveloper] = useState(app?.developer ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [version, setVersion] = useState(app?.version ?? "1.0");
  const [kind, setKind] = useState<AppKind>(startKind);
  const [category, setCategory] = useState(app?.category ?? categoriesOf(startKind)[0].id);
  const [featured, setFeatured] = useState(app?.featured ?? false);
  const [selfUpdate, setSelfUpdate] = useState(app?.selfUpdate ?? false);
  const [icon, setIcon] = useState(app?.icon ?? "");
  const [shots, setShots] = useState<string[]>(app?.screenshots ?? []);
  const [pkg, setPkg] = useState<PackageState | null>(app ? { name: app.packageName, size: app.packageSize } : null);
  const [errors, setErrors] = useState<{ name?: string; pkg?: string }>({});
  const [dragging, setDragging] = useState(false);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Async file handling reads the latest values through refs.
  const nameRef = useRef(name);
  nameRef.current = name;
  const iconRef = useRef(icon);
  iconRef.current = icon;

  const addFiles = useCallback(
    async (paths: string[], zone: string | null) => {
      let iconTaken = false;
      for (const path of paths) {
        try {
          if (isPackagePath(path)) {
            const info = await native.fileInfo(path);
            setPkg({ source: path, name: info.name, size: info.size });
            setErrors((e) => ({ ...e, pkg: undefined }));
            if (!nameRef.current.trim()) {
              nameRef.current = guessName(info.name);
              setName(nameRef.current);
            }
          } else if (isImagePath(path)) {
            const staged = await native.stageImage(path);
            const toIcon = zone === "icon" ? !iconTaken : zone !== "shots" && !iconRef.current;
            if (toIcon) {
              iconTaken = true;
              iconRef.current = staged.path;
              setIcon(staged.path);
            } else {
              setShots((s) => {
                if (s.length >= MAX_SHOTS) {
                  toast(`Maximum ${MAX_SHOTS} captures d'écran`, "error");
                  return s;
                }
                return [...s, staged.path];
              });
            }
          } else {
            toast(`Format non pris en charge : ${basename(path)}`, "error");
          }
        } catch (e) {
          toast(String(e), "error");
        }
      }
    },
    [toast],
  );

  // Files dropped on the window before the form opened
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (state.files.length) void addFiles(state.files, null);
  }, [state.files, addFiles]);

  // Native drag & drop: highlight the zone under the cursor, route files on drop
  useEffect(
    () =>
      onFileDrop((e) => {
        if (saving) return;
        if (e.type === "enter" || e.type === "over") {
          setDragging(true);
          setHoverZone(dropzoneAt(e.x, e.y));
        } else {
          setDragging(false);
          setHoverZone(null);
          if (e.type === "drop") void addFiles(e.paths, dropzoneAt(e.x, e.y));
        }
      }),
    [addFiles, saving],
  );

  const changeKind = (k: AppKind) => {
    setKind(k);
    if (!categoriesOf(k).some((c) => c.id === category)) setCategory(categoriesOf(k)[0].id);
  };

  const choosePackage = async () => {
    const path = await pickPackage();
    if (path) void addFiles([path], "package");
  };
  const chooseIcon = async () => void addFiles(await pickImages(false), "icon");
  const chooseShots = async () => void addFiles(await pickImages(true), "shots");

  const submit = async () => {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "Donne un nom à l'application";
    if (!pkg && inTauri) errs.pkg = "Ajoute le fichier .exe, .msi ou .zip";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setProgress(0);
    try {
      const saved = await saveApp(
        { name, developer, description, kind, category, version, featured, selfUpdate, icon, screenshots: shots, packageSource: pkg?.source },
        app,
        ({ done, total }) => setProgress(total ? done / total : 1),
      );
      toast(app ? "Modifications enregistrées" : `${saved.name} a été ajouté au store`, "success");
      onClose();
      if (!app) {
        setTab("store");
        setTimeout(() => openApp(saved.id, `new:${saved.id}`), 220);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const zone = (id: string) =>
    `relative transition-[border-color,background-color,box-shadow] duration-200 ${
      hoverZone === id
        ? "border-accent bg-accent-soft shadow-[0_0_0_4px] shadow-accent/15"
        : dragging
          ? "border-accent/50"
          : "border-line hover:border-muted/50"
    }`;

  const pkgType = pkg ? packageTypeOf(pkg.name) : null;
  const importing = saving && !!pkg?.source;

  return (
    <>
      <ModalHeader title={app ? "Modifier l'application" : "Ajouter au store"} onClose={onClose} disabled={saving} />

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-3 pb-6">
        <div className="grid grid-cols-[220px_1fr] gap-8">
          {/* Left column: icon + package */}
          <div className="flex flex-col gap-5">
            <Field label="Icône">
              <button
                type="button"
                data-dropzone="icon"
                onClick={chooseIcon}
                className={`group grid aspect-square w-full place-items-center overflow-hidden rounded-[36px] border-2 border-dashed ${zone("icon")}`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {icon ? (
                    <motion.div
                      key={icon}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    >
                      <AppIcon name={name || "?"} icon={icon} size={150} className="shadow-lg" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-2 px-4 text-center text-muted"
                    >
                      <ImagePlus className="size-8" strokeWidth={1.5} />
                      <span className="text-xs leading-snug">Glisse une image ou clique pour choisir</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {icon && (
                  <span
                    role="button"
                    aria-label="Retirer l'icône"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIcon("");
                    }}
                    className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </span>
                )}
              </button>
            </Field>

            <Field label="Fichier de l'application" error={errors.pkg}>
              <button
                type="button"
                data-dropzone="package"
                onClick={choosePackage}
                disabled={saving}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-3.5 text-left ${zone("package")} ${
                  errors.pkg ? "!border-red-400" : ""
                }`}
              >
                <div
                  className={`grid size-11 shrink-0 place-items-center rounded-xl ${pkg ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}
                >
                  {pkg ? <FileArchive className="size-5" /> : <Upload className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  {pkg ? (
                    <>
                      <div className="truncate text-[13px] font-medium" title={pkg.name}>
                        {pkg.name}
                      </div>
                      <div className="text-xs text-muted">
                        {formatBytes(pkg.size)}
                        {pkgType && ` · ${PACKAGE_LABEL[pkgType]}`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[13px] font-medium">Choisir un fichier</div>
                      <div className="text-xs text-muted">.exe, .msi ou .zip</div>
                    </>
                  )}
                </div>
              </button>
            </Field>
            {pkgType === "zip" && (
              <p className="-mt-3 text-xs leading-relaxed text-muted">
                Le zip sera extrait à l'installation et Nexora lancera l'exécutable principal.
              </p>
            )}
          </div>

          {/* Right column: details */}
          <div className="flex flex-col gap-5">
            <Field label="Nom" error={errors.name}>
              <input
                autoFocus={!state.files.length}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                }}
                placeholder="Ex. Nebula Drift"
                className={`input text-base font-medium ${errors.name ? "!border-red-400" : ""}`}
              />
            </Field>

            <div className="grid grid-cols-[1fr_140px] gap-4">
              <Field label="Développeur">
                <input value={developer} onChange={(e) => setDeveloper(e.target.value)} placeholder="Studio, auteur…" className="input" />
              </Field>
              <Field label="Version">
                <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" className="input" />
              </Field>
            </div>

            <Field label="Type">
              <Segmented
                id="form-kind"
                value={kind}
                onChange={changeKind}
                options={[
                  { value: "game", label: "Jeu" },
                  { value: "app", label: "Application" },
                ]}
              />
            </Field>

            <Field label="Catégorie">
              <div className="flex flex-wrap gap-1.5">
                {categoriesOf(kind).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`relative h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                      category === c.id ? "border-transparent text-accent-fg" : "border-line text-fg hover:bg-surface-2"
                    }`}
                  >
                    {category === c.id && (
                      <motion.span
                        layoutId="form-category"
                        className="absolute inset-0 rounded-full bg-accent"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative">{c.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Présente l'application en quelques lignes…"
                className="input resize-none py-3 leading-relaxed"
              />
            </Field>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Mettre à la une</div>
                <div className="text-xs text-muted">Affiche l'application dans la grande bannière d'accueil.</div>
              </div>
              <Switch checked={featured} onChange={setFeatured} label="Mettre à la une" />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Mise à jour automatique intégrée</div>
                <div className="text-xs text-muted">
                  L'application se met à jour toute seule : le store ne proposera pas « Mettre à jour ».
                </div>
              </div>
              <Switch checked={selfUpdate} onChange={setSelfUpdate} label="Mise à jour automatique intégrée" />
            </label>
          </div>
        </div>

        {/* Screenshots */}
        <Field label="Captures d'écran" className="mt-7">
          <div
            data-dropzone="shots"
            className={`flex flex-wrap gap-3 rounded-2xl border-2 border-dashed p-3 ${zone("shots")}`}
          >
            <AnimatePresence initial={false}>
              {shots.map((s, i) => (
                <motion.div
                  key={s}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                  className="group relative h-28 shrink-0 overflow-hidden rounded-xl bg-surface-2"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  <img src={fileUrl(s)} alt={`Capture ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                  <button
                    type="button"
                    aria-label="Retirer la capture"
                    onClick={() => setShots((list) => list.filter((x) => x !== s))}
                    className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {shots.length < MAX_SHOTS && (
            <motion.button
              layout
              type="button"
              onClick={chooseShots}
              className="flex h-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-6 text-muted transition-colors hover:text-fg"
              style={{ aspectRatio: shots.length ? undefined : "auto", minWidth: shots.length ? 140 : "100%" }}
            >
              <Plus className="size-6" strokeWidth={1.6} />
              <span className="text-xs">{shots.length ? "Ajouter" : "Glisse des images ici ou clique pour en choisir"}</span>
            </motion.button>
            )}
          </div>
          <div className="mt-1.5 text-right text-xs text-muted">{shots.length}/{MAX_SHOTS}</div>
        </Field>

        {!inTauri && (
          <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-xs text-accent">
            Mode démo navigateur : les fichiers ne peuvent être ajoutés que dans l'application Tauri (npm run tauri dev).
          </p>
        )}
      </div>

      <ModalFooter>
        <span className="mr-auto text-xs text-muted">Astuce : tu peux glisser plusieurs fichiers à la fois dans la fenêtre.</span>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={submit} disabled={saving} className="relative min-w-[150px] overflow-hidden">
          {importing && (
            <motion.span
              className="absolute inset-y-0 left-0 bg-white/20"
              animate={{ width: `${progress * 100}%` }}
              transition={{ ease: "easeOut", duration: 0.25 }}
            />
          )}
          <span className="relative flex items-center gap-2 tabular-nums">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? (importing ? `Import… ${Math.round(progress * 100)} %` : "Enregistrement…") : app ? "Enregistrer" : "Ajouter au store"}
          </span>
        </Button>
      </ModalFooter>
    </>
  );
}

function Field({ label, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-[13px] font-medium text-muted">{label}</div>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
