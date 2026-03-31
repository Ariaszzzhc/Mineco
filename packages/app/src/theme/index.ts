import { lightTokens, type ThemeTokens } from "./tokens";

export type { ThemeTokens };
export { lightTokens };

function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(`--${toKebabCase(key)}`, value);
  }
}

export { applyTheme as default };
