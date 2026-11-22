import { Check, Cloud, FolderOpen, Monitor, Moon, Sun } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "../components/Modal";
import { Button, Segmented } from "../components/ui";
import { inTauri, native } from "../lib/native";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";
import type { ThemeChoice } from "../state/theme";
import { useToast } from "../state/toast";
import { useUpdater } from "../state/updater";

function AdminLogin() {
  const { provider, login, logout } = useStore();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (provider.canEdit) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
        <div className="text-sm">
          <span className="font-medium">Administrateur connecté.</span>{" "}
          <span className="text-muted">Tu peux ajouter, modifier et supprimer des apps.</span>
        </div>
        <Button variant="secondary" size="sm" className="bg-surface" onClick={logout}>
          Se déconnecter
        </Button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email.trim(), password);
      setPassword("");
      toast("Connecté en administrateur", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-2xl bg-surface-2 p-4">
      <div className="text-sm font-medium">Connexion administrateur</div>
      <div className="text-xs text-muted">Nécessaire pour publier des apps. Les autres personnes peuvent seulement les installer.</div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        autoComplete="username"
        placeholder="E-mail"
        className="input"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        autoComplete="current-password"
        placeholder="Mot de passe"
        className="input"
      />
      <Button type="submit" size="sm" disabled={busy || !email || !password} className="self-end">
        Se connecter
      </Button>
    </form>
  );
}

function SourceCard({
  icon,
  title,
  text,
  active,
  badge,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 rounded-2xl border p-4 transition-colors ${
        active ? "border-accent bg-accent-soft" : "border-line opacity-60"
      }`}
    >
      <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted uppercase">{badge}</span>}
        </div>
        <div className="text-xs text-muted">{text}</div>
      </div>
      {active && <Check className="size-5 shrink-0 text-accent" />}
    </div>
  );
}

export function SettingsModal({ theme, setTheme }: { theme: ThemeChoice; setTheme(t: ThemeChoice): void }) {
  const { settingsOpen, setSettingsOpen } = useNav();
  const { provider, apps, installs } = useStore();
  const toast = useToast();
  const updater = useUpdater();
  const installedCount = Object.keys(installs).length;

  return (
    <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Paramètres" width="max-w-xl">
      <div className="flex flex-col gap-7 pb-3">
        <section>
          <h3 className="mb-2.5 text-[13px] font-medium text-muted">Apparence</h3>
          <Segmented
            id="theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "Système", icon: <Monitor className="size-4" /> },
              { value: "light", label: "Clair", icon: <Sun className="size-4" /> },
              { value: "dark", label: "Sombre", icon: <Moon className="size-4" /> },
            ]}
          />
        </section>

        <section>
          <h3 className="mb-2.5 text-[13px] font-medium text-muted">Serveur du catalogue</h3>
          <div className="flex flex-col gap-3">
            <SourceCard
              icon={<Cloud className="size-5" />}
              title={provider.label}
              text={provider.url}
              active
            />
            <AdminLogin />
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 text-[13px] font-medium text-muted">Stockage</h3>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
            <div className="text-sm">
              <span className="font-medium">{apps.length}</span> dans le store ·{" "}
              <span className="font-medium">{installedCount}</span> installé{installedCount > 1 ? "s" : ""}
            </div>
            {inTauri && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-surface"
                onClick={() => native.reveal("").catch((e) => toast(String(e), "error"))}
              >
                <FolderOpen className="size-4" /> Ouvrir le dossier
              </Button>
            )}
          </div>
        </section>

        {inTauri && (
          <section>
            <h3 className="mb-2.5 text-[13px] font-medium text-muted">Mises à jour de Nexora Store</h3>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3">
              <div className="min-w-0 text-sm">
                {updater.status === "checking" && "Recherche de mises à jour…"}
                {updater.status === "uptodate" && "Nexora Store est à jour."}
                {updater.status === "idle" && "Vérifie si une nouvelle version est disponible."}
                {updater.status === "available" && (
                  <>
                    <span className="font-medium">Version {updater.version}</span> disponible
                  </>
                )}
                {updater.status === "downloading" &&
                  (updater.progress < 0 ? "Téléchargement…" : `Téléchargement… ${Math.round(updater.progress * 100)} %`)}
                {updater.status === "error" && (
                  <span className="text-red-500">Impossible de vérifier les mises à jour (GitHub injoignable ?)</span>
                )}
              </div>
              {updater.status === "available" ? (
                <Button size="sm" onClick={() => void updater.install()}>
                  Mettre à jour et redémarrer
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-surface"
                  disabled={updater.status === "checking" || updater.status === "downloading"}
                  onClick={() => void updater.check()}
                >
                  Rechercher
                </Button>
              )}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-muted">Nexora Store · version {__APP_VERSION__}</p>
      </div>
    </Modal>
  );
}
