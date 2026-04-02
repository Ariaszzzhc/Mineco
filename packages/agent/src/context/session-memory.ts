import type { ChatRequest, ProviderRegistry } from "@mineco/provider";
import type { SessionMessage } from "../session/types.js";

export interface ExtractedNotes {
  projectContext: string;
  userPreferences: string;
  currentTaskStatus: string;
  keyDecisions: string;
  filePaths: string[];
  additionalContext: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a session memory extractor. Analyze the following conversation summary and extract key information as JSON.

Respond with ONLY a JSON object with these fields:
- projectContext: Brief description of the project and its tech stack
- userPreferences: Coding style, language, or tool preferences the user has shown
- currentTaskStatus: What task is being worked on and its current status
- keyDecisions: Important decisions or choices made during the conversation
- filePaths: Array of file paths mentioned or modified
- additionalContext: Any other important context for continuing this work

If a field has no relevant information, use an empty string (or empty array for filePaths).
Keep all fields concise - each should be 1-2 sentences maximum.`;

function buildConversationSummary(messages: SessionMessage[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "user":
        lines.push(`[User]: ${msg.content}`);
        break;
      case "assistant": {
        const firstLine = msg.content.split("\n")[0] ?? "";
        const tools = msg.toolCalls?.map((tc) => tc.name).join(", ");
        const toolInfo = tools ? ` (tools: ${tools})` : "";
        lines.push(`[Assistant]: ${firstLine}${toolInfo}`);
        break;
      }
      case "tool":
        lines.push(
          `[Tool ${msg.toolName}]: ${msg.content.slice(0, 200)}`,
        );
        break;
    }
  }

  return lines.join("\n");
}

export async function extractSessionNotes(
  messages: SessionMessage[],
  providerRegistry: ProviderRegistry,
  providerId: string,
  model: string,
): Promise<ExtractedNotes | null> {
  if (messages.length < 4) return null;

  const provider = providerRegistry.get(providerId);
  const summary = buildConversationSummary(messages);

  try {
    const request: ChatRequest = {
      model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: summary },
      ],
      stream: false,
    };

    const response = await provider.chat(request);
    const raw = response.message.content;

    if (typeof raw !== "string") return null;

    // Strip markdown code fences if present
    const jsonStr = raw
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== "object" || parsed === null) return null;

    return {
      projectContext: String(parsed.projectContext ?? ""),
      userPreferences: String(parsed.userPreferences ?? ""),
      currentTaskStatus: String(parsed.currentTaskStatus ?? ""),
      keyDecisions: String(parsed.keyDecisions ?? ""),
      filePaths: Array.isArray(parsed.filePaths)
        ? parsed.filePaths.map(String)
        : [],
      additionalContext: String(parsed.additionalContext ?? ""),
    };
  } catch {
    return null;
  }
}
