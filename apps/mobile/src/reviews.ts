/**
 * Tasks and reviews are shared by everyone in the workspace, but approving a review sends or
 * changes things on one person's Google account, so only that person is asked to. Items from
 * before this was recorded carry no requester and count as everyone's.
 */
export function isMine(item: { createdBy?: string }, me?: string): boolean {
  return !item.createdBy || !me || item.createdBy === me;
}

/** Who a task or review is waiting on, for a sentence like "Waiting on Alice". */
export function requesterName(item: { createdByName?: string }): string {
  return item.createdByName ?? "a teammate";
}
