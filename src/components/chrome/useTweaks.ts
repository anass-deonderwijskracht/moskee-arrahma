import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type Navigation = "sidebar" | "topnav";
export type Accent = "petrol" | "emerald" | "indigo" | "charcoal";

export interface Tweaks {
  theme: Theme;
  density: Density;
  navigation: Navigation;
  accent: Accent;
}

const DEFAULTS: Tweaks = {
  theme: "light",
  density: "comfortable",
  navigation: "sidebar",
  accent: "petrol",
};

export const ACCENT_PALETTES: Record<Accent, Record<string, string>> = {
  petrol: { "--primary": "oklch(0.42 0.075 195)", "--primary-hover": "oklch(0.36 0.085 195)", "--primary-soft": "oklch(0.94 0.025 195)", "--accent": "oklch(0.62 0.105 65)", "--accent-soft": "oklch(0.94 0.040 65)" },
  emerald: { "--primary": "oklch(0.46 0.085 155)", "--primary-hover": "oklch(0.40 0.095 155)", "--primary-soft": "oklch(0.94 0.030 155)", "--accent": "oklch(0.65 0.110 50)", "--accent-soft": "oklch(0.94 0.040 50)" },
  indigo: { "--primary": "oklch(0.42 0.110 270)", "--primary-hover": "oklch(0.36 0.120 270)", "--primary-soft": "oklch(0.94 0.030 270)", "--accent": "oklch(0.65 0.110 35)", "--accent-soft": "oklch(0.94 0.045 35)" },
  charcoal: { "--primary": "oklch(0.25 0.012 220)", "--primary-hover": "oklch(0.18 0.012 220)", "--primary-soft": "oklch(0.93 0.005 220)", "--accent": "oklch(0.55 0.150 30)", "--accent-soft": "oklch(0.94 0.040 30)" },
};

const STORAGE_KEY = "ma-tweaks";

function load(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

/** Tweaks state persisted to localStorage; applies theme/density/accent to <html>. */
export function useTweaks() {
  const [tweaks, setTweaks] = useState<Tweaks>(load);

  const set = useCallback(<K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaks((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = tweaks.theme;
    root.dataset.density = tweaks.density;
    const palette = ACCENT_PALETTES[tweaks.accent] || ACCENT_PALETTES.petrol;
    for (const [k, v] of Object.entries(palette)) root.style.setProperty(k, v);
  }, [tweaks.theme, tweaks.density, tweaks.accent]);

  return { tweaks, set };
}
