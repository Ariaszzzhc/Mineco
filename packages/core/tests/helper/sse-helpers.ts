interface SSEEvent {
  event: string;
  data: unknown;
}

export async function collectSSEEvents(
  response: Response,
): Promise<SSEEvent[]> {
  const text = await response.text();
  const events: SSEEvent[] = [];
  const lines = text.split("\n");
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      const dataStr = line.slice(5).trim();
      if (dataStr) {
        events.push({ event: currentEvent, data: JSON.parse(dataStr) });
      }
    }
  }
  return events;
}
