import { motion } from "motion/react";
import { useState } from "react";
import { hueOf } from "../lib/format";
import { fileUrl } from "../lib/native";

interface Props {
  name: string;
  icon: string;
  size?: number;
  layoutId?: string;
  className?: string;
}

/** Rounded app icon, or a gradient letter avatar when the app has none. */
export function AppIcon({ name, icon, size = 64, layoutId, className = "" }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const src = fileUrl(icon);
  const hue = hueOf(name);
  const showImage = src && !broken;

  return (
    <motion.div
      layoutId={layoutId}
      className={`relative shrink-0 overflow-hidden bg-surface-2 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.23),
        boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.06)",
      }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center font-display font-semibold text-white"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 80% 63%), hsl(${(hue + 40) % 360} 72% 45%))`,
            fontSize: size * 0.42,
          }}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
    </motion.div>
  );
}

/** Same footprint as an icon, used while the real one flies to the detail page. */
export function IconPlaceholder({ size = 64 }: { size?: number }) {
  return <div className="shrink-0" style={{ width: size, height: size }} />;
}
