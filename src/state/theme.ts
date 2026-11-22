import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "nexora.theme";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// ---------------------------------------------------------------------------
// Accent colour
// ---------------------------------------------------------------------------

const ACCENT_KEY = "nexora.accent";
export const DEFAULT_ACCENT = "#5a4bf2";

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Violet", hex: DEFAULT_ACCENT },
  { name: "Bleu", hex: "#4263eb" },
  { name: "Cyan", hex: "#1098ad" },
  { name: "Vert", hex: "#12b886" },
  { name: "Orange", hex: "#f76707" },
  { name: "Rouge", hex: "#e03131" },
  { name: "Rose", hex: "#e64980" },
];

const HEX = /^#[0-9a-f]{6}$/i;

function readAccent(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY) ?? "";
    return HEX.test(v) ? v.toLowerCase() : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Derives the accent variables from one colour, for the current light/dark theme. */
function applyAccent(hex: string) {
  const root = document.documentElement;
  const keys = ["--accent", "--accent-hover", "--accent-fg", "--accent-soft"];
  if (hex === DEFAULT_ACCENT) {
    keys.forEach((k) => root.style.removeProperty(k));
    return;
  }
  const dark = root.classList.contains("dark");
  const base = dark ? mix(hex, "#ffffff", 0.3) : hex;
  const hover = dark ? mix(hex, "#ffffff", 0.45) : mix(hex, "#000000", 0.12);
  const soft = dark ? mix(hex, "#18181f", 0.78) : mix(hex, "#ffffff", 0.88);
  const fg = luminance(base) > 0.45 ? "#0f0f14" : "#ffffff";
  root.style.setProperty("--accent", base);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-fg", fg);
  root.style.setProperty("--accent-soft", soft);
}

export function useAccent() {
  const [accent, setAccent] = useState(readAccent);

  useEffect(() => {
    applyAccent(accent);
    // The derived colours depend on light/dark: refresh when the theme class flips.
    const obs = new MutationObserver(() => applyAccent(accent));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [accent]);

  const update = useCallback((hex: string) => {
    if (!HEX.test(hex)) return;
    setAccent(hex.toLowerCase());
    try {
      localStorage.setItem(ACCENT_KEY, hex.toLowerCase());
    } catch {
      /* the colour simply won't persist */
    }
  }, []);

  return [accent, update] as const;
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Call once before the first render to avoid a flash of the wrong theme. */
export const applyStoredTheme = () => {
  apply(readChoice());
  applyAccent(readAccent());
};

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const m = media();
    const onChange = () => apply("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [choice]);

  const update = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the theme simply won't persist */
    }
  }, []);

  return [choice, update] as const;
}
