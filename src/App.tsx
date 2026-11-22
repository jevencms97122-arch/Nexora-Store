import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AlertTriangle, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, LoadingSkeleton } from "./components/EmptyState";
import { TopBar } from "./components/TopBar";
import { isImagePath, isPackagePath } from "./lib/format";
import { onFileDrop } from "./lib/native";
import { AppDetail } from "./pages/AppDetail";
import { AppFormHost } from "./pages/AppForm";
import { Discover } from "./pages/Discover";
import { Library } from "./pages/Library";
import { SearchResults } from "./pages/SearchResults";
import { SettingsModal } from "./pages/Settings";
import { NavRoot, useNav } from "./state/nav";
import { StoreProviderRoot, useStore } from "./state/store";
import { UpdaterRoot } from "./state/updater";
import { useTheme } from "./state/theme";
import { ToastRoot } from "./state/toast";

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastRoot>
        <StoreProviderRoot>
          <NavRoot>
            <UpdaterRoot>
              <Shell />
            </UpdaterRoot>
          </NavRoot>
        </StoreProviderRoot>
      </ToastRoot>
    </MotionConfig>
  );
}

function Shell() {
  const { tab, query, detail, openForm } = useNav();
  const { ready, error, provider } = useStore();
  const [theme, setTheme] = useTheme();
  const [dropping, setDropping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const view = query.trim() ? "search" : tab;

  // Dropping an app or images anywhere opens the add form with them.
  useEffect(
    () =>
      onFileDrop((e) => {
        const useful = provider.canEdit && e.paths.some((p) => isPackagePath(p) || isImagePath(p));
        if (e.type === "enter" || e.type === "over") setDropping(useful);
        else {
          setDropping(false);
          if (e.type === "drop" && useful) openForm(null, e.paths);
        }
      }),
    [provider, openForm],
  );

  let page;
  if (!ready) page = <LoadingSkeleton />;
  else if (error)
    page = (
      <EmptyState
        icon={<AlertTriangle className="size-11" strokeWidth={1.6} />}
        title="Impossible de charger le store"
        text={error}
      />
    );
  else if (view === "search") page = <SearchResults />;
  else if (view === "library") page = <Library />;
  else page = <Discover />;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        <motion.div ref={scroller} layoutScroll className="h-full overflow-y-auto">
          <AnimatePresence mode="wait" initial={false} onExitComplete={() => scroller.current?.scrollTo({ top: 0 })}>
            <motion.div
              key={ready ? view : "loading"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {page}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>{detail && <AppDetail key={detail.id} id={detail.id} layoutKey={detail.key} />}</AnimatePresence>
      </main>

      <AppFormHost />
      <SettingsModal theme={theme} setTheme={setTheme} />

      <AnimatePresence>
        {dropping && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[60] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="grid h-full place-items-center rounded-[32px] border-2 border-dashed border-accent bg-bg/85 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.9, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 26 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  className="grid size-20 place-items-center rounded-[26px] bg-accent text-accent-fg shadow-xl shadow-accent/30"
                >
                  <Download className="size-9" />
                </motion.div>
                <div>
                  <div className="font-display text-2xl font-semibold">Dépose pour ajouter à Nexora</div>
                  <div className="mt-1 text-sm text-muted">Un fichier .exe, .msi ou .zip, et ses images</div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
