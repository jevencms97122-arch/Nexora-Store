import { SearchX } from "lucide-react";
import { useMemo } from "react";
import { AppCard } from "../components/AppCard";
import { EmptyState } from "../components/EmptyState";
import { categoryName } from "../lib/categories";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function SearchResults() {
  const { apps } = useStore();
  const { query } = useNav();

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return apps
      .map((a) => {
        const name = normalize(a.name);
        const score = name.startsWith(q)
          ? 0
          : name.includes(q)
            ? 1
            : [a.developer, categoryName(a.category)].some((s) => normalize(s).includes(q))
              ? 2
              : normalize(a.description).includes(q)
                ? 3
                : -1;
        return { a, score };
      })
      .filter((r) => r.score >= 0)
      .sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name))
      .map((r) => r.a);
  }, [apps, query]);

  if (!results.length) {
    return (
      <EmptyState
        icon={<SearchX className="size-11" strokeWidth={1.6} />}
        title="Aucun résultat"
        text={`Rien ne correspond à « ${query.trim()} ». Essaie un autre nom, un développeur ou une catégorie.`}
      />
    );
  }

  return (
    <div className="px-6 pt-6 pb-16">
      <p className="mb-3 px-2 text-sm text-muted">
        {results.length} résultat{results.length > 1 ? "s" : ""} pour « <span className="text-fg">{query.trim()}</span> »
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-1">
        {results.map((a, i) => (
          <AppCard key={a.id} app={a} variant="list" scope="search" index={i} />
        ))}
      </div>
    </div>
  );
}
