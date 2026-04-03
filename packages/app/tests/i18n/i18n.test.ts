import { describe, expect, it } from "vitest";
import enDict from "../../src/locales/en";
import zhCNDict from "../../src/locales/zh-CN";

describe("i18n locale files", () => {
  const enKeys = Object.keys(enDict).sort();
  const zhCNKeys = Object.keys(zhCNDict).sort();

  it("en and zh-CN should have identical key sets", () => {
    expect(enKeys).toEqual(zhCNKeys);
  });

  it("should have at least 80 translation keys", () => {
    expect(enKeys.length).toBeGreaterThanOrEqual(80);
  });

  it("should not have duplicate keys in en", () => {
    const uniqueKeys = new Set(enKeys);
    expect(uniqueKeys.size).toBe(enKeys.length);
  });

  it("should not have empty values in en", () => {
    for (const [key, value] of Object.entries(enDict)) {
      expect(value, `Key "${key}" has an empty value`).toBeTruthy();
    }
  });

  it("should not have empty values in zh-CN", () => {
    for (const [key, value] of Object.entries(zhCNDict)) {
      expect(value, `Key "${key}" has an empty value`).toBeTruthy();
    }
  });
});
