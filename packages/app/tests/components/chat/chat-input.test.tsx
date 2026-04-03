import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "../../../src/components/chat/chat-input";
import { I18nProvider } from "../../../src/i18n/index.tsx";

describe("ChatInput", () => {
  it("should render textarea and send button", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));
    expect(container.querySelector("textarea")).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="Send message"]'),
    ).toBeTruthy();
  });

  it("should show stop button when isStreaming", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={true} />
      </I18nProvider>
    ));
    expect(
      container.querySelector('button[aria-label="Stop streaming"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="Send message"]'),
    ).toBeFalsy();
  });

  it("should show send button when not streaming", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));
    expect(
      container.querySelector('button[aria-label="Send message"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('button[aria-label="Stop streaming"]'),
    ).toBeFalsy();
  });

  it("should disable textarea when disabled prop is true", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={true}
        />
      </I18nProvider>
    ));
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });

  it("should disable textarea when isStreaming", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={true} />
      </I18nProvider>
    ));
    expect(
      (container.querySelector("textarea") as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });

  it("should disable send button when textarea is empty", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));
    const btn = container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("should call onSend with trimmed value on send button click", () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea")!;
    fireEvent.input(textarea, { target: { value: "  hello  " } });

    const btn = container.querySelector('button[aria-label="Send message"]')!;
    fireEvent.click(btn);

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("should clear textarea after sending", () => {
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: "hello" } });

    const btn = container.querySelector('button[aria-label="Send message"]')!;
    fireEvent.click(btn);

    expect(textarea.value).toBe("");
  });

  it("should call onSend on Enter without Shift", () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea")!;
    fireEvent.input(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("should not call onSend on Shift+Enter", () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea")!;
    fireEvent.input(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("should not send when disabled", () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput
          onSend={onSend}
          onStop={vi.fn()}
          isStreaming={false}
          disabled={true}
        />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea")!;
    // Can't type when disabled, but let's test the guard
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("should not send empty/whitespace message", () => {
    const onSend = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={onSend} onStop={vi.fn()} isStreaming={false} />
      </I18nProvider>
    ));

    const textarea = container.querySelector("textarea")!;
    fireEvent.input(textarea, { target: { value: "   " } });
    const btn = container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    fireEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("should call onStop when stop button is clicked", () => {
    const onStop = vi.fn();
    const { container } = render(() => (
      <I18nProvider>
        <ChatInput onSend={vi.fn()} onStop={onStop} isStreaming={true} />
      </I18nProvider>
    ));

    const btn = container.querySelector('button[aria-label="Stop streaming"]')!;
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalled();
  });
});
