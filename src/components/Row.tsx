import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  title: string;
  onMore?: () => void;
  children: ReactNode;
  index?: number;
  /** Horizontal padding, so the shelf can bleed to the edges of its container. */
  gutter?: number;
}

/** Horizontally scrolling shelf, Play Store style, with arrows on hover. */
export function Row({ title, onMore, children, index = 0, gutter = 32 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow = "absolute top-[38%] z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/95 text-fg shadow-lg shadow-black/10 backdrop-blur transition-all duration-200 hover:scale-105";

  return (
    <motion.section
      className="group/row relative"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3.5 flex items-end justify-between" style={{ paddingInline: gutter }}>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {onMore && (
          <button onClick={onMore} className="text-[13px] font-medium text-accent hover:underline">
            Tout voir
          </button>
        )}
      </div>
      <div className="relative">
        <motion.div
          ref={ref}
          layoutScroll
          onScroll={update}
          className="no-scrollbar flex snap-x gap-5 overflow-x-auto pt-1 pb-3"
          style={{ paddingInline: gutter, scrollPaddingInline: gutter }}
        >
          {children}
        </motion.div>
        <button
          aria-label="Précédent"
          onClick={() => scroll(-1)}
          className={`${arrow} left-3 ${canLeft ? "opacity-0 group-hover/row:opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          aria-label="Suivant"
          onClick={() => scroll(1)}
          className={`${arrow} right-3 ${canRight ? "opacity-0 group-hover/row:opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </motion.section>
  );
}
