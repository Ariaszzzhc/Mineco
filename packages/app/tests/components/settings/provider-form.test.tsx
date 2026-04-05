import { fireEvent, render } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../src/i18n/index.tsx";

vi.mock("../../../src/stores/config", () => ({
  configStore: {
    addProvider: vi.fn(async () => []),
  },
}));

import { ProviderForm } from "../../../src/components/settings/provider-form";
import { configStore } from "../../../src/stores/config";

const mockAddProvider = configStore.addProvider as ReturnType<typeof vi.fn>;

function getForm(container: HTMLElement): HTMLFormElement {
  return container.querySelector("form") as HTMLFormElement;
}

function getCompatButton(container: HTMLElement): HTMLButtonElement {
  const buttons = container.querySelectorAll("button");
  return Array.from(buttons).find((b) =>
    b.textContent?.includes("OpenAI Compatible"),
  ) as HTMLButtonElement;
}

describe("ProviderForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddProvider.mockResolvedValue([]);
  });

  it("should render with zhipu type selected by default", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));
    const zhipuBtn = container.querySelector("button");
    expect(zhipuBtn?.textContent).toContain("Zhipu");
  });

  it("should show zhipu fields initially", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));
    // Zhipu fields: API Key input + Platform select + Endpoint select
    const inputs = container.querySelectorAll("input");
    const selects = container.querySelectorAll("select");
    expect(inputs.length).toBeGreaterThanOrEqual(1); // API key input
    expect(selects.length).toBeGreaterThanOrEqual(2); // Platform + Endpoint
  });

  it("should show openai-compatible fields on toggle", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));
    // Click "OpenAI Compatible" toggle
    fireEvent.click(getCompatButton(container));

    // Should now show Provider ID, Base URL, API Key, Model fields
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(4); // compId, baseURL, apiKey, modelId, modelName
  });

  it("should submit zhipu provider with correct data", async () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));

    // Fill API key
    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    // Submit form
    fireEvent.submit(getForm(container));

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "zhipu",
          apiKey: "test-key",
        }),
      );
    });
  });

  it("should submit openai-compatible provider with correct data", async () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));

    // Switch to OpenAI Compatible
    fireEvent.click(getCompatButton(container));

    // Fill fields
    const inputs = container.querySelectorAll("input");
    fireEvent.input(inputs[0] as HTMLInputElement, {
      target: { value: "deepseek" },
    }); // Provider ID
    fireEvent.input(inputs[1] as HTMLInputElement, {
      target: { value: "https://api.deepseek.com/v1" },
    }); // Base URL
    fireEvent.input(inputs[3] as HTMLInputElement, {
      target: { value: "deepseek-chat" },
    }); // Model ID
    fireEvent.input(inputs[4] as HTMLInputElement, {
      target: { value: "DeepSeek Chat" },
    }); // Model name

    // Submit
    fireEvent.submit(getForm(container));

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "openai-compatible",
          id: "deepseek",
          baseURL: "https://api.deepseek.com/v1",
          models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
        }),
      );
    });
  });

  it("should omit apiKey when empty for openai-compatible", async () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));

    // Switch to OpenAI Compatible
    fireEvent.click(getCompatButton(container));

    // Fill only required fields (no api key)
    const inputs = container.querySelectorAll("input");
    fireEvent.input(inputs[0] as HTMLInputElement, {
      target: { value: "ollama" },
    });
    fireEvent.input(inputs[1] as HTMLInputElement, {
      target: { value: "http://localhost:11434/v1" },
    });
    fireEvent.input(inputs[3] as HTMLInputElement, {
      target: { value: "llama3" },
    });
    fireEvent.input(inputs[4] as HTMLInputElement, {
      target: { value: "Llama 3" },
    });

    fireEvent.submit(getForm(container));

    await vi.waitFor(() => {
      const call = mockAddProvider.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(call).not.toHaveProperty("apiKey");
    });
  });

  it("should reset form after successful submit", async () => {
    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));

    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    fireEvent.submit(getForm(container));

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalled();
    });

    // After submit, api key should be cleared
    expect(apiKeyInput.value).toBe("");
  });

  it("should handle submit error gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAddProvider.mockRejectedValue(new Error("API error"));

    const { container } = render(() => (
      <I18nProvider>
        <ProviderForm />
      </I18nProvider>
    ));

    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    fireEvent.submit(getForm(container));

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalled();
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
