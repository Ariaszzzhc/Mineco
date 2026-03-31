import { fireEvent, render } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/stores/config", () => ({
  configStore: {
    addProvider: vi.fn(async () => []),
  },
}));

import { ProviderForm } from "../../../src/components/settings/provider-form";
import { configStore } from "../../../src/stores/config";

const mockAddProvider = configStore.addProvider as ReturnType<typeof vi.fn>;

describe("ProviderForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddProvider.mockResolvedValue([]);
  });

  it("should render with zhipu type selected by default", () => {
    const { container } = render(() => <ProviderForm />);
    const zhipuBtn = container.querySelector("button");
    expect(zhipuBtn?.textContent).toContain("Zhipu");
  });

  it("should show zhipu fields initially", () => {
    const { container } = render(() => <ProviderForm />);
    // Zhipu fields: API Key input + Platform select + Endpoint select
    const inputs = container.querySelectorAll("input");
    const selects = container.querySelectorAll("select");
    expect(inputs.length).toBeGreaterThanOrEqual(1); // API key input
    expect(selects.length).toBeGreaterThanOrEqual(2); // Platform + Endpoint
  });

  it("should show openai-compatible fields on toggle", () => {
    const { container } = render(() => <ProviderForm />);
    // Click "OpenAI Compatible" toggle
    const buttons = container.querySelectorAll("button");
    const compatBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("OpenAI Compatible"),
    );
    fireEvent.click(compatBtn!);

    // Should now show Provider ID, Base URL, API Key, Model fields
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(4); // compId, baseURL, apiKey, modelId, modelName
  });

  it("should submit zhipu provider with correct data", async () => {
    const { container } = render(() => <ProviderForm />);

    // Fill API key
    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    // Submit form
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

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
    const { container } = render(() => <ProviderForm />);

    // Switch to OpenAI Compatible
    const buttons = container.querySelectorAll("button");
    const compatBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("OpenAI Compatible"),
    );
    fireEvent.click(compatBtn!);

    // Fill fields
    const inputs = container.querySelectorAll("input");
    fireEvent.input(inputs[0]!, { target: { value: "deepseek" } }); // Provider ID
    fireEvent.input(inputs[1]!, {
      target: { value: "https://api.deepseek.com/v1" },
    }); // Base URL
    fireEvent.input(inputs[3]!, { target: { value: "deepseek-chat" } }); // Model ID
    fireEvent.input(inputs[4]!, { target: { value: "DeepSeek Chat" } }); // Model name

    // Submit
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

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
    const { container } = render(() => <ProviderForm />);

    // Switch to OpenAI Compatible
    const buttons = container.querySelectorAll("button");
    const compatBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("OpenAI Compatible"),
    );
    fireEvent.click(compatBtn!);

    // Fill only required fields (no api key)
    const inputs = container.querySelectorAll("input");
    fireEvent.input(inputs[0]!, { target: { value: "ollama" } });
    fireEvent.input(inputs[1]!, {
      target: { value: "http://localhost:11434/v1" },
    });
    fireEvent.input(inputs[3]!, { target: { value: "llama3" } });
    fireEvent.input(inputs[4]!, { target: { value: "Llama 3" } });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await vi.waitFor(() => {
      const call = mockAddProvider.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(call).not.toHaveProperty("apiKey");
    });
  });

  it("should reset form after successful submit", async () => {
    const { container } = render(() => <ProviderForm />);

    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalled();
    });

    // After submit, api key should be cleared
    expect(apiKeyInput.value).toBe("");
  });

  it("should handle submit error gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAddProvider.mockRejectedValue(new Error("API error"));

    const { container } = render(() => <ProviderForm />);

    const apiKeyInput = container.querySelector(
      "input[type='password']",
    ) as HTMLInputElement;
    fireEvent.input(apiKeyInput, { target: { value: "test-key" } });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await vi.waitFor(() => {
      expect(mockAddProvider).toHaveBeenCalled();
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
