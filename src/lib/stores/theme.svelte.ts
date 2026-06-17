/**
 * Appearance / theming store. Owns the live <html> attributes and CSS vars the
 * whole design system reads (data-theme, data-platform, --accent, --fs) and
 * persists changes through window.mineco.appearance (with a localStorage mirror
 * so the very first paint before IPC resolves isn't flashed wrong).
 *
 * Apply happens in a $effect so any field change re-applies automatically.
 * Theme/accent changes briefly set html[data-switching] to suppress the
 * Chromium custom-property repaint flash.
 */

import type { AppSettings } from "../agent-protocol";

/** Appearance shape used throughout the renderer (alias of the shared AppSettings). */
export type Appearance = AppSettings;

/**
 * Narrow view of the parts of window.mineco this store calls. The backend
 * agent owns the canonical MinecoApi; we cast through this so the store
 * compiles regardless of when the backend lands `appearance` on the bridge
 * (optional chaining at the call sites tolerates it being absent at runtime).
 */
interface AppearanceBridge {
  appearance?: {
    get?: () => Promise<Appearance | undefined>;
    set?: (a: Appearance) => Promise<void> | void;
  };
}
function bridge(): AppearanceBridge {
  return (globalThis as { mineco?: AppearanceBridge }).mineco ?? {};
}

const STORAGE_KEY = "mineco.appearance";

const DEFAULTS: Appearance = {
  theme: "dark",
  accent: "#43A95A",
  platform: detectPlatform(),
  fontScale: 1,
  lang: "en",
};

function detectPlatform(): "mac" | "win" {
  if (typeof navigator === "undefined") return "mac";
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes("win")) return "win";
  return "mac";
}

function readLocal(): Partial<Appearance> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Appearance>) : null;
  } catch {
    return null;
  }
}

function writeLocal(a: Appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

// Seed from localStorage so the first paint is already themed.
const seeded: Appearance = { ...DEFAULTS, ...(readLocal() ?? {}) };

let themeMode = $state<Appearance["theme"]>(seeded.theme);
let accent = $state<string>(seeded.accent);
let platform = $state<Appearance["platform"]>(seeded.platform);
let fontScale = $state<number>(seeded.fontScale);
let lang = $state<Appearance["lang"]>(seeded.lang);

let initialized = false;

function snapshot(): Appearance {
  return { theme: themeMode, accent, platform, fontScale, lang };
}

/** Imperatively apply the current state to <html>. Called from the $effect. */
function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-switching", "");
  root.setAttribute("data-theme", themeMode);
  root.setAttribute("data-platform", platform);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--fs", String(fontScale));
  // Clear the transition-suppression after the repaint settles.
  window.setTimeout(() => root.removeAttribute("data-switching"), 90);
}

export const theme = {
  get theme() {
    return themeMode;
  },
  get accent() {
    return accent;
  },
  get platform() {
    return platform;
  },
  get fontScale() {
    return fontScale;
  },
  get lang() {
    return lang;
  },
  /** Whole-object snapshot (handy for Settings forms). */
  get value(): Appearance {
    return snapshot();
  },

  /**
   * Call once from App.svelte onMount. Loads the persisted appearance from the
   * backend (falling back to the localStorage seed already applied) and starts
   * the apply effect. Idempotent.
   */
  async init() {
    if (initialized) return;
    initialized = true;

    try {
      const loaded = await bridge().appearance?.get?.();
      if (loaded) {
        themeMode = loaded.theme ?? themeMode;
        accent = loaded.accent ?? accent;
        platform = loaded.platform ?? platform;
        fontScale = loaded.fontScale ?? fontScale;
        lang = loaded.lang ?? lang;
        writeLocal(snapshot());
      }
    } catch {
      /* backend unavailable — keep localStorage/default seed */
    }

    // Re-apply <html> attributes whenever any appearance field changes.
    $effect.root(() => {
      $effect(() => {
        // touch all fields so the effect tracks them
        void themeMode;
        void accent;
        void platform;
        void fontScale;
        apply();
      });
    });
  },

  /** Patch one or more fields, persist to backend + localStorage, re-apply. */
  set(patch: Partial<Appearance>) {
    if (patch.theme !== undefined) themeMode = patch.theme;
    if (patch.accent !== undefined) accent = patch.accent;
    if (patch.platform !== undefined) platform = patch.platform;
    if (patch.fontScale !== undefined) fontScale = patch.fontScale;
    if (patch.lang !== undefined) lang = patch.lang;

    const next = snapshot();
    writeLocal(next);
    void bridge().appearance?.set?.(next);
  },
};
