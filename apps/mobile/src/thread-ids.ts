/** Selection of the active chat thread in the threads provider. */
export type Selection = { id: string; existing: boolean };

/**
 * The thread id the chat screen runs as. Without Intelligence there is no
 * hosted main thread, so the main chat keeps the local "local-main" id while
 * a selected channel thread runs as its own binding id — the server routes
 * the run to that thread's channel worker via the persisted binding.
 */
export function resolveThreadId(richThreads: boolean, selection: Selection): string {
  if (richThreads) return selection.id;
  return selection.id === "local" ? "local-main" : selection.id;
}
