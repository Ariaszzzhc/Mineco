export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last incomplete line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith(":")) {
          continue;
        }
        if (trimmed === "data: [DONE]") {
          return;
        }
        if (trimmed.startsWith("data: ")) {
          yield trimmed.slice(6);
        }
      }
    }

    // Process remaining buffer
    const trimmed = buffer.trim();
    if (trimmed !== "" && trimmed !== "data: [DONE]" && trimmed.startsWith("data: ")) {
      yield trimmed.slice(6);
    }
  } finally {
    reader.releaseLock();
  }
}
