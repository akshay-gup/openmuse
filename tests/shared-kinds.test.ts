import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SHARED_KINDS } from "../apps/server/src/db.ts";

/**
 * Everything except the orchestrator chat is shared by everyone who signs in. A record kind that
 * is read or written for a person (`db.get(owner, "kind", ...)`) is shared unless it is listed
 * here, so a new kind can't quietly end up per person.
 */
const KEPT_PER_PERSON = new Set([
  // The orchestrator and its chat, and the id of each person's main thread.
  "conversation-settings",
  "channels",
  "conversations",
  "conversation-authors",
  // Choice panels are keyed by thread and run only when JEV_MODE is on.
  "jev_threads",
  "jev_panels",
  "jev_evidence",
  "jev_mail_evidence",
]);

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

test("every kind of record kept for a person is shared, or deliberately kept per person", () => {
  const root = new URL("../apps/server/src", import.meta.url).pathname;
  const call =
    /\.(?:get|list|listWhere|put|remove|take|insertIfAbsent|compareAndSwap|appendItem|removeItem|patchItems)(?:<[^>]*>)?\(\s*([^,()]+?),\s*"([\w-]+)"/g;
  const unplaced = new Set<string>();
  for (const file of sources(root)) {
    for (const [, owner, kind] of readFileSync(file, "utf8").matchAll(call)) {
      // Calls that name the workspace or the system outright already say where they live.
      if (/^"(?:shared|system)"$/.test(owner.trim())) continue;
      if (!SHARED_KINDS.has(kind) && !KEPT_PER_PERSON.has(kind)) unplaced.add(kind);
    }
  }
  assert.deepEqual(
    [...unplaced],
    [],
    `Add these kinds to SHARED_KINDS in apps/server/src/db.ts, or to KEPT_PER_PERSON here if they really belong to one person`,
  );
});

test("nothing is both shared and kept per person", () => {
  assert.deepEqual(
    [...KEPT_PER_PERSON].filter((kind) => SHARED_KINDS.has(kind)),
    [],
  );
});
