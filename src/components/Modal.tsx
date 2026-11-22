import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./ui";

interface ModalProps {
  open: boolean;
  onClose(): void;
  title?: string;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Ignore Escape/backdrop clicks (e.g. while saving). */
  locked?: boolean;
  /** Render children directly in the panel (they bring their own header/scroll/footer). */
  bare?: boolean;
}

export function Modal({ open, onClose, title, width = "max-w-lg", children, footer, locked, bare }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, locked, onClose]);

  // Portal: a transformed ancestor (page transitions) would otherwise trap `position: fixed`.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-6" initial="hidden" animate="shown" exit="hidden">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }}
            transition={{ duration: 0.2 }}
            onClick={() => !locked && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative flex max-h-full w-full ${width} flex-col overflow-hidden rounded-[28px] border border-line bg-surface shadow-2xl shadow-black/25`}
            variants={{
              hidden: { opacity: 0, scale: 0.95, y: 16 },
              shown: { opacity: 1, scale: 1, y: 0 },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {bare ? (
              children
            ) : (
              <>
                {title && <ModalHeader title={title} onClose={onClose} disabled={locked} />}
                <div className="min-h-0 flex-1 overflow-y-auto px-7 py-4">{children}</div>
                {footer && <ModalFooter>{footer}</ModalFooter>}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ModalHeader({ title, onClose, disabled }: { title: string; onClose(): void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between px-7 pt-6 pb-2">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <IconButton label="Fermer" onClick={onClose} disabled={disabled} className="-mr-2">
        <X className="size-[18px]" />
      </IconButton>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line px-7 py-4">{children}</div>;
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="pb-2 text-sm leading-relaxed text-muted">{message}</div>
    </Modal>
  );
}
