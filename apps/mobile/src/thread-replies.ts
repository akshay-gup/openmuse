type ThreadMessage = { id: string; role: string; content?: unknown; toolCalls?: unknown[] };

/** An assistant turn that only calls tools has no text of its own: the person sees a tool card, not a reply. */
function isToolOnlyTurn(message: ThreadMessage): boolean {
  if (message.role !== "assistant") return false;
  const text = typeof message.content === "string" ? message.content.trim() : "";
  return !text && (typeof message.content === "string" || !!message.toolCalls?.length);
}

/** Seeded channel context precedes the parent; it is not a reply. */
export function countThreadReplies(messages: ThreadMessage[], parentMessageId?: string): number {
  const parentIndex = messages.findIndex((message) => message.id === parentMessageId);
  return messages.filter(
    (message, index) =>
      index > parentIndex &&
      (message.role === "user" || message.role === "assistant") &&
      !isToolOnlyTurn(message),
  ).length;
}
