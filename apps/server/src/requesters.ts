import type { Store } from "./db.ts";

/** Display names for the people behind shared work, so a teammate's task reads "Waiting on Alice". */
export async function requesterNames(
  db: Store,
  ids: Iterable<string | undefined>,
): Promise<ReadonlyMap<string, string>> {
  const names = new Map<string, string>();
  for (const id of new Set(ids)) {
    if (!id) continue;
    const user = await db.get<{ name?: string }>("system", "users", id);
    if (user?.name) names.set(id, user.name);
  }
  return names;
}

/** A copy of the item that names its requester. The name is for display and is never stored. */
export function withRequester<T extends { createdBy?: string; createdByName?: string }>(
  item: T,
  names: ReadonlyMap<string, string>,
): T {
  const name = item.createdBy ? names.get(item.createdBy) : undefined;
  return name ? { ...item, createdByName: name } : item;
}
