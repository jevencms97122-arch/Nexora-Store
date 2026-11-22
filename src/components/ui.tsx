import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm shadow-accent/20",
  secondary: "bg-surface-2 text-fg hover:bg-line",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-7 text-[15px] gap-2",
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={`grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Pill selector whose highlight slides between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
  className = "",
}: {
  value: T | null;
  options: SegmentOption<T>[];
  onChange(v: T): void;
  id: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 rounded-full bg-surface-2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${
            value === o.value ? "text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-full bg-surface shadow-sm shadow-black/10"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
      />
    </button>
  );
}
