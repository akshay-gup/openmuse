type ThreadMessage = { id: string; role: string };

/** Seeded channel context precedes the parent; it is not a reply. */
export function countThreadReplies(messages: ThreadMessage[], parentMessageId?: string): number {
  const parentIndex = messages.findIndex((message) => message.id === parentMessageId);
  return messages.filter((message, index) => index > parentIndex &&
    (message.role === "user" || message.role === "assistant")).length;
}
