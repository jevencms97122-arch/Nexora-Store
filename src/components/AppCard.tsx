import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { categoryName } from "../lib/categories";
import { formatBytes, hueOf } from "../lib/format";
import { fileUrl } from "../lib/native";
import type { StoreApp } from "../lib/types";
import { useNav } from "../state/nav";
import { useStore } from "../state/store";
import { AppIcon, IconPlaceholder } from "./AppIcon";
import { InstallButton } from "./InstallButton";

/** Screenshot with a fade-in, or a soft gradient when there is none. */
export function Shot({ src, name, className = "" }: { src?: string; name: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const url = src ? fileUrl(src) : "";
  const hue = hueOf(name);
  return (
    <div
      className={`h-full w-full ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 60% 55% / .9), hsl(${(hue + 50) % 360} 55% 30% / .95))`,
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

interface Props {
  app: StoreApp;
  variant: "tile" | "banner" | "list";
  /** Makes layoutIds unique when the same app appears in several places. */
  scope: string;
  index?: number;
  fluid?: boolean;
}

const ICON_SIZE = { tile: 112, banner: 44, list: 60 };

export function AppCard({ app, variant, scope, index = 0, fluid = false }: Props) {
  const { detail, openApp } = useNav();
  const { installs } = useStore();
  const key = `${scope}:${app.id}`;
  const size = ICON_SIZE[variant];
  const installed = !!installs[app.id];

  const icon =
    detail?.key === key ? (
      <IconPlaceholder size={size} />
    ) : (
      <AppIcon name={app.name} icon={app.icon} size={size} layoutId={key} />
    );

  const open = () => openApp(app.id, key);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const meta = (
    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
      {installed && <CheckCircle2 className="size-3.5 shrink-0 text-accent" />}
      <span className="truncate">
        {categoryName(app.category)} · {formatBytes(app.packageSize)}
      </span>
    </div>
  );

  const common = {
    role: "button" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: onKey,
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: Math.min(index, 10) * 0.035, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (variant === "tile") {
    return (
      <motion.div {...common} className={`group shrink-0 snap-start outline-none ${fluid ? "w-full" : "w-[132px]"}`}>
        <div className="w-fit rounded-[26px] transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/10 group-focus-visible:ring-2 group-focus-visible:ring-accent">
          {icon}
        </div>
        <div className="mt-2.5 line-clamp-2 text-[13px] leading-snug font-medium">{app.name}</div>
        {meta}
      </motion.div>
    );
  }

  if (variant === "banner") {
    return (
      <motion.div {...common} className={`group shrink-0 snap-start outline-none ${fluid ? "w-full" : "w-[300px]"}`}>
        <div className="aspect-video overflow-hidden rounded-2xl bg-surface-2 ring-accent transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/15 group-focus-visible:ring-2">
          <Shot
            src={app.screenshots[0]}
            name={app.name}
            className="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          {icon}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{app.name}</div>
            {meta}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      {...common}
      className="group flex items-center gap-4 rounded-2xl p-3 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{app.name}</div>
        <div className="truncate text-[13px] text-muted">{app.developer || "Développeur inconnu"}</div>
        {meta}
      </div>
      <InstallButton app={app} size="sm" />
    </motion.div>
  );
}
