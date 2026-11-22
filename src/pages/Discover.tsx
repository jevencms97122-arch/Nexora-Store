import { AnimatePresence, motion } from "motion/react";
import { LayoutGrid, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AppCard } from "../components/AppCard";
import { EmptyState } from "../components/EmptyState";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { Button } from "../components/ui";
import { categoriesIn } from "../lib/categories";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";

export function Discover() {
  const { apps, provider } = useStore();
  const { openForm } = useNav();
  const [category, setCategory] = useState("all");

  const list = apps;
  const categories = useMemo(() => categoriesIn(list), [list]);
  const featured = useMemo(() => {
    const picked = list.filter((a) => a.featured);
    return (picked.length ? picked : list).slice(0, 6);
  }, [list]);

  const variantOf = (_a: unknown) => "banner" as const;

  if (!list.length) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-11" strokeWidth={1.6} />}
        title="Rien dans le store pour l'instant"
        text="Glisse un fichier .exe, .msi ou .zip dans la fenêtre, ou clique sur Ajouter pour publier ta première entrée dans le store."
        action={
          provider.canEdit && (
            <Button size="lg" onClick={() => openForm(null)}>
              <Plus className="size-5" /> Ajouter
            </Button>
          )
        }
      />
    );
  }

  const selected = categories.find((c) => c.id === category);
  const chips = [{ id: "all", name: "Tout" }, ...categories];

  return (
    <div className="space-y-9 pt-6 pb-16">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-8">
        {chips.map((c) => {
          const active = (selected?.id ?? "all") === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`relative h-9 shrink-0 rounded-full border px-4 text-[13px] font-medium transition-colors ${
                active ? "border-transparent text-accent-fg" : "border-line text-fg hover:bg-surface-2"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="chip-store"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{c.name}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!selected ? (
          <motion.div
            key="all"
            className="space-y-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <Hero apps={featured} />
            <Row title="Nouveautés" index={0}>
              {list.slice(0, 15).map((a, i) => (
                <AppCard key={a.id} app={a} variant={variantOf(a)} scope="new-store" index={i} />
              ))}
            </Row>
            {categories.map((c, ci) => {
              const items = list.filter((a) => a.category === c.id);
              return (
                <Row key={c.id} title={c.name} index={ci + 1} onMore={items.length > 4 ? () => setCategory(c.id) : undefined}>
                  {items.map((a, i) => (
                    <AppCard key={a.id} app={a} variant={variantOf(a)} scope={`cat-${c.id}`} index={i} />
                  ))}
                </Row>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="px-8"
          >
            <h2 className="mb-5 font-display text-2xl font-semibold tracking-tight">{selected.name}</h2>
            <div
              className={`grid gap-x-5 gap-y-7 ${
                "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
              }`}
            >
              {list
                .filter((a) => a.category === selected.id)
                .map((a, i) => (
                  <AppCard key={a.id} app={a} variant={variantOf(a)} scope={`grid-${selected.id}`} index={i} fluid />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
