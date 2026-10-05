import { MessageSchema } from "@ag-ui/core";
import {
  type ChannelThread,
  ORCHESTRATOR_CHANNEL_ID,
} from "../../../../packages/domain/src/agent.ts";
import type { Store } from "../db.ts";
import { SHARED_OWNER, type ThreadBindingStore } from "./threads.ts";

export type ChannelMessage = ReturnType<typeof MessageSchema.parse>;

/** Where a conversation transcript lives, and which channel it belongs to when it is shared. */
export interface ConversationHome {
  owner: string;
  channelId?: string;
}

/**
 * Whose a conversation transcript is. A channel (`channel:<id>`) and every thread bound to a
 * shared channel is one transcript for everyone, so a teammate sees the whole exchange, the
 * agent's replies included. Only the orchestrator chat, and a thread that is not bound to a
 * channel yet, belongs to the person who is writing it.
 */
export async function conversationHome(
  threadId: string,
  sessionOwner: string,
  channelOfThread: (owner: string, threadId: string) => Promise<ChannelThread | null>,
): Promise<ConversationHome> {
  if (threadId.startsWith("channel:")) {
    const channelId = threadId.slice("channel:".length);
    return channelId === ORCHESTRATOR_CHANNEL_ID
      ? { owner: sessionOwner }
      : { owner: SHARED_OWNER, channelId };
  }
  // The legacy main chat has no thread id at all.
  if (threadId === "default") return { owner: sessionOwner };
  const binding = await channelOfThread(sessionOwner, threadId);
  return binding && binding.channelId !== ORCHESTRATOR_CHANNEL_ID
    ? { owner: SHARED_OWNER, channelId: binding.channelId }
    : { owner: sessionOwner };
}

/**
 * Save a writer's copy of a shared transcript. Messages are merged with what is stored by id, so
 * two people writing at once add to each other's turns instead of replacing them, and each user
 * message is attributed to its writer: a sidecar record tracks message-id -> owner (first writer
 * wins), then the author's Google profile name is stamped on the message. Writers sharing a name
 * are told apart by the sidecar, so identical names never collide.
 *
 * A thread forked from a channel is seeded with copies of channel messages; those keep their
 * channel author (`inherited`) rather than being credited to whoever forked the thread.
 */
export async function saveSharedConversation(
  db: Store,
  id: string,
  writer: string,
  incoming: ChannelMessage[],
  inherited?: Record<string, string>,
): Promise<ChannelMessage[]> {
  const sidecar =
    (await db.get<{ authors?: Record<string, string> }>(
      SHARED_OWNER,
      "conversation-authors",
      id,
    )) ?? {};
  const authors: Record<string, string> = sidecar.authors ?? {};
  for (const m of incoming) {
    if (m.role === "user" && !authors[m.id]) authors[m.id] = inherited?.[m.id] ?? writer;
  }
  const names = new Map<string, string>();
  for (const author of new Set(Object.values(authors))) {
    const user = await db.get<{ name?: string }>("system", "users", author);
    names.set(author, user?.name ?? author);
  }
  const stored =
    (await db.get<{ messages?: unknown[] }>(SHARED_OWNER, "conversations", id))?.messages ?? [];
  const byId = new Map<string, ChannelMessage>();
  for (const m of stored) {
    const parsed = MessageSchema.safeParse(m);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
  }
  for (const m of incoming) byId.set(m.id, m);
  await db.put(SHARED_OWNER, "conversation-authors", { id, authors });
  const messages = [...byId.values()].map((m) => {
    const author = m.role === "user" ? authors[m.id] : undefined;
    return author ? { ...m, name: names.get(author) ?? author } : m;
  });
  await db.put(SHARED_OWNER, "conversations", { id, messages });
  return messages;
}

/** Who wrote each message of a channel's own transcript, for threads forked from it. */
export async function channelAuthors(
  db: Store,
  channelId: string,
): Promise<Record<string, string> | undefined> {
  return (
    await db.get<{ authors?: Record<string, string> }>(
      SHARED_OWNER,
      "conversation-authors",
      `channel:${channelId}`,
    )
  )?.authors;
}

/**
 * Move the transcripts of threads in shared channels, which used to be saved with whoever ran
 * them and so were invisible to everyone else, into the shared transcript. Orchestrator
 * transcripts stay where they are. Safe to run on every start; returns how many were moved.
 */
export async function adoptSharedTranscripts(
  db: Store,
  threads: ThreadBindingStore,
): Promise<number> {
  const sharedThreads = new Map(
    (await threads.scan(SHARED_OWNER))
      .filter((binding) => binding.channelId !== ORCHESTRATOR_CHANNEL_ID)
      .map((binding) => [binding.threadId, binding]),
  );
  let transcripts = 0;
  for (const { owner, id } of await db.ids("conversations")) {
    const binding = sharedThreads.get(id);
    if (!binding || owner === SHARED_OWNER || owner === "system") continue;
    const stored = await db.get<{ messages?: unknown[] }>(owner, "conversations", id);
    const messages = (stored?.messages ?? []).flatMap((message) => {
      const parsed = MessageSchema.safeParse(message);
      return parsed.success ? [parsed.data] : [];
    });
    // Only this person could see the thread until now, so every user turn in it is theirs, apart
    // from messages copied in from the channel, which keep that channel's author.
    await saveSharedConversation(
      db,
      id,
      owner,
      messages,
      await channelAuthors(db, binding.channelId),
    );
    await db.remove(owner, "conversations", id);
    transcripts++;
  }
  return transcripts;
}
