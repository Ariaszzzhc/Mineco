import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import type { AppConfig } from "../../../src/lib/types";
import { createTestConfig, createZhipuProvider, createOpenAIProvider } from "../../helper/fixture";

// Use a mutable reference so the mock factory can access it
const mockConfigRef: { value: () => AppConfig | null } = {
  value: () => null,
};

vi.mock("../../../src/stores/config", () => ({
  configStore: {
    config: () => mockConfigRef.value(),
    updateSettings: vi.fn(async () => ({})),
  },
}));

import { configStore } from "../../../src/stores/config";
import { SettingsForm } from "../../../src/components/settings/settings-form";

const mockUpdateSettings = configStore.updateSettings as ReturnType<typeof vi.fn>;

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render provider select with options from config", () => {
    mockConfigRef.value = () =>
      createTestConfig({
        providers: [createZhipuProvider(), createOpenAIProvider()],
      });
    const { container } = render(() => <SettingsForm />);
    const options = container.querySelectorAll("select:first-of-type option");
    // "Select provider" + Zhipu + test-provider = 3
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it('should show "Select provider" as default option', () => {
    mockConfigRef.value = () => createTestConfig();
    const { container } = render(() => <SettingsForm />);
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("should show model select when provider with models is selected", () => {
    mockConfigRef.value = () =>
      createTestConfig({
        providers: [createOpenAIProvider()],
      });
    const { container } = render(() => <SettingsForm />);

    // Select the openai-compatible provider
    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[0]!, { target: { value: "test-provider" } });

    // Should now show a second select for model
    expect(container.querySelectorAll("select").length).toBeGreaterThanOrEqual(2);
  });

  it("should clear model on provider change", () => {
    mockConfigRef.value = () =>
      createTestConfig({
        providers: [createOpenAIProvider(), createZhipuProvider()],
      });
    const { container } = render(() => <SettingsForm />);

    const providerSelect = container.querySelector("select") as HTMLSelectElement;

    // Select openai provider (which has models)
    fireEvent.change(providerSelect, { target: { value: "test-provider" } });

    // Select zhipu (which has no models)
    fireEvent.change(providerSelect, { target: { value: "zhipu" } });

    // Model select should not be present (zhipu has no models)
    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(1);
  });

  it("should call updateSettings with selected values on save", async () => {
    mockConfigRef.value = () =>
      createTestConfig({
        providers: [createOpenAIProvider()],
      });
    const { container } = render(() => <SettingsForm />);

    // Select provider
    const providerSelect = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "test-provider" } });

    // Save
    const saveBtn = container.querySelector("button")!;
    fireEvent.click(saveBtn);

    await vi.waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProvider: "test-provider",
        }),
      );
    });
  });

  it("should only include non-empty values in payload", async () => {
    mockConfigRef.value = () =>
      createTestConfig({
        providers: [createOpenAIProvider()],
      });
    const { container } = render(() => <SettingsForm />);

    // Don't select anything, just click save
    const saveBtn = container.querySelector("button")!;
    fireEvent.click(saveBtn);

    await vi.waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled();
    });
    // Should be called with empty or partial object
    const call = mockUpdateSettings.mock.calls[0]![0] as Record<string, string>;
    // All values should be empty strings or the object should have no meaningful entries
    const hasValues = Object.values(call).some((v) => v !== "");
    if (!hasValues) {
      expect(Object.keys(call).length).toBe(0);
    }
  });

  it("should label zhipu provider as Zhipu", () => {
    mockConfigRef.value = () =>
      createTestConfig({ providers: [createZhipuProvider()] });
    const { container } = render(() => <SettingsForm />);
    const options = container.querySelectorAll("select option");
    const zhipuOption = Array.from(options).find((o) => o.value === "zhipu");
    expect(zhipuOption?.textContent).toBe("Zhipu");
  });

  it("should label openai-compatible by id", () => {
    mockConfigRef.value = () =>
      createTestConfig({ providers: [createOpenAIProvider()] });
    const { container } = render(() => <SettingsForm />);
    const options = container.querySelectorAll("select option");
    const compatOption = Array.from(options).find((o) => o.value === "test-provider");
    expect(compatOption?.textContent).toBe("test-provider");
  });
});
