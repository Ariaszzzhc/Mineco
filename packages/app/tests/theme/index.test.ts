import { describe, it, expect, beforeEach } from "vitest";
import applyTheme from "../../src/theme/index";
import { lightTokens } from "../../src/theme/tokens";

describe("applyTheme", () => {
  beforeEach(() => {
    // Clear all custom properties
    const root = document.documentElement;
    root.style.cssText = "";
  });

  it("should set CSS custom properties for all tokens", () => {
    applyTheme(lightTokens);
    const root = document.documentElement;
    for (const key of Object.keys(lightTokens)) {
      // toKebabCase: camelCase -> -kebab-case, e.g. "textPrimary" -> "-text-primary"
      const prop = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      expect(root.style.getPropertyValue(prop)).toBe(
        lightTokens[key as keyof typeof lightTokens],
      );
    }
  });

  it("should use kebab-case property names", () => {
    applyTheme({ ...lightTokens });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--text-primary")).toBe(
      lightTokens.textPrimary,
    );
    expect(root.style.getPropertyValue("--surface-elevated")).toBe(
      lightTokens.surfaceElevated,
    );
  });

  it("should overwrite previous values on re-apply", () => {
    applyTheme(lightTokens);
    const customTokens = { ...lightTokens, primary: "#FF0000" };
    applyTheme(customTokens);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--primary")).toBe("#FF0000");
  });
});
