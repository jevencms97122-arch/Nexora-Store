import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

type ToastFn = (text: string, kind?: ToastKind) => void;
const ToastContext = createContext<ToastFn>(() => {});

let nextId = 1;

export function ToastRoot({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<ToastFn>((text, kind = "info") => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 5000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm shadow-lg shadow-black/10"
            >
              {t.kind === "success" && <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />}
              {t.kind === "error" && <XCircle className="size-4 shrink-0 text-red-500" />}
              {t.kind === "info" && <Info className="size-4 shrink-0 text-accent" />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
