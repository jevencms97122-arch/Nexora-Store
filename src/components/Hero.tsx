import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { categoryName } from "../lib/categories";
import type { StoreApp } from "../lib/types";
import { useNav } from "../state/nav";
import { AppIcon, IconPlaceholder } from "./AppIcon";
import { Shot } from "./AppCard";
import { InstallButton } from "./InstallButton";

const SLIDE_MS = 7000;

/** Big rotating "À la une" banner. */
export function Hero({ apps }: { apps: StoreApp[] }) {
  const { detail, openApp } = useNav();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = apps.length;
  const current = apps[index % count];

  useEffect(() => {
    if (paused || count < 2 || detail) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, paused, count, detail]);

  if (!current) return null;
  const key = `hero:${current.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => openApp(current.id, key)}
      className="relative mx-8 h-[340px] cursor-pointer overflow-hidden rounded-[28px] bg-surface-2 shadow-sm"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={current.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: SLIDE_MS / 1000 + 1, ease: "linear" }}
          >
            <Shot src={current.screenshots[0]} name={current.name} />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/0" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />

          <div className="absolute inset-y-0 left-0 flex max-w-xl flex-col justify-end p-10 text-white">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-4"
            >
              <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-md">
                <Sparkles className="size-3.5" /> À la une
              </span>
              <div className="flex items-center gap-4">
                {detail?.key === key ? (
                  <IconPlaceholder size={72} />
                ) : (
                  <AppIcon name={current.name} icon={current.icon} size={72} layoutId={key} className="shadow-xl" />
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-display text-3xl font-semibold tracking-tight">{current.name}</h2>
                  <p className="text-sm text-white/75">
                    {current.developer || categoryName(current.category)} · {categoryName(current.category)}
                  </p>
                </div>
              </div>
              {current.description && (
                <p className="line-clamp-2 text-sm leading-relaxed text-white/80">{current.description}</p>
              )}
              <div className="flex items-center gap-3">
                <InstallButton app={current} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openApp(current.id, key);
                  }}
                  className="h-10 rounded-full bg-white/15 px-5 text-sm font-medium backdrop-blur-md transition-colors hover:bg-white/25"
                >
                  Voir la fiche
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <div className="absolute right-8 bottom-8 flex items-center gap-1.5">
          {apps.map((a, i) => (
            <button
              key={a.id}
              aria-label={`Afficher ${a.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
              className="relative h-2 overflow-hidden rounded-full bg-white/30 transition-[width] duration-300"
              style={{ width: i === index % count ? 28 : 8 }}
            >
              {i === index % count && (
                <motion.span
                  key={`${a.id}-${paused}`}
                  className="absolute inset-y-0 left-0 bg-white"
                  initial={{ width: paused ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: paused ? 0 : SLIDE_MS / 1000, ease: "linear" }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
