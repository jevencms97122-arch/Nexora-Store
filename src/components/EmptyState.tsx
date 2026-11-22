import { motion } from "motion/react";
import type { ReactNode } from "react";

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-md flex-col items-center px-8 pt-24 pb-16 text-center"
    >
      <motion.div
        initial={{ scale: 0.8, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
        className="relative mb-7 grid size-24 place-items-center rounded-[30px] bg-gradient-to-br from-accent to-fuchsia-500 text-white shadow-xl shadow-accent/30"
      >
        <div className="absolute -inset-4 -z-10 rounded-[40px] bg-accent/10 blur-xl" />
        {icon}
      </motion.div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-7">{action}</div>}
    </motion.div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-10 pt-6">
      <div className="mx-8 h-[340px] rounded-[28px] bg-surface-2" />
      <div className="flex gap-5 px-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="w-[300px] shrink-0">
            <div className="aspect-video rounded-2xl bg-surface-2" />
            <div className="mt-3 h-3 w-2/3 rounded-full bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
