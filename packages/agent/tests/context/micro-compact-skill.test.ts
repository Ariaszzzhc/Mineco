import type { Message } from "@mineco/provider";
import { describe, expect, it } from "vitest";
import { microCompact } from "../../src/context/micro-compact.js";

describe("microCompact skill content protection", () => {
  const skillContent = `<skill-content data-name="test-skill">
# Skill: test-skill

Detailed skill instructions that should be preserved.
</skill-content>`;

  function makeMessages(toolContent: string): Message[] {
    return [
      { role: "system", content: "system prompt" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "" },
      {
        role: "tool",
        content: toolContent,
        toolCallId: "call-1",
        toolName: "activate_skill",
      } as Message,
      { role: "user", content: "follow up" },
    ];
  }

  it("should not truncate skill-content tool outputs", () => {
    const longSkillContent = `${skillContent}\n${"x".repeat(10000)}`;
    const messages = makeMessages(longSkillContent);
    const result = microCompact(messages, {
      maxToolOutputChars: 200,
      tokenBudget: 0,
    });
    expect(result.wasCompressed).toBe(true);
    const toolMsg = result.messages.find(
      (m) =>
        m.role === "tool" &&
        typeof m.content === "string" &&
        m.content.includes("<skill-content"),
    );
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content as string).toBe(longSkillContent);
  });

  it("should not remove skill-content messages in pass 2", () => {
    const messages: Message[] = [
      { role: "system", content: "system prompt" },
      ...Array.from({ length: 20 }, (_, i) => ({
        role: "user" as const,
        content: `user message ${i}`,
      })),
      ...Array.from({ length: 20 }, (_, _i) => ({
        role: "assistant" as const,
        content: "",
      })),
      {
        role: "tool" as const,
        content: skillContent,
        toolCallId: "call-skill",
        toolName: "activate_skill",
      } as Message,
      { role: "user" as const, content: "final message" },
    ];
    const result = microCompact(messages, {
      maxToolOutputChars: 999999,
      tokenBudget: 0,
      recentMessageCount: 2,
    });
    const skillMsg = result.messages.find(
      (m) =>
        "content" in m &&
        typeof m.content === "string" &&
        m.content.includes("<skill-content"),
    );
    expect(skillMsg).toBeDefined();
    expect(skillMsg?.content).toContain("test-skill");
  });
});
