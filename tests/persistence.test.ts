import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPool, createStore } from "../apps/server/src/db.ts";

test("fresh nested data directory starts and survives a database restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "hive-db-"));
  try {
    const options = { dataDir: join(root, "new-install", "postgres") };
    const first = await createStore(options);
    await first.put("owner", "actions", { id: "action1", status: "executing" });
    await first.close();
    const second = await createStore(options);
    await second.recoverInterruptedActions();
    assert.equal((await second.get("owner", "actions", "action1"))?.status, "outcome_unknown");
    await second.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("idle Postgres client errors are logged instead of crashing the process", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const pool = createPool("postgres://127.0.0.1:1/hive");
  try {
    assert.doesNotThrow(() => pool.emit("error", new Error("terminating connection")));
    assert.equal(logged.mock.callCount(), 1);
  } finally {
    await pool.end();
  }
});

test("array entries are appended, patched and removed atomically", async () => {
  const store = await createStore();
  try {
    await store.put("owner", "tasks", { id: "t1", title: "Plan", notes: [], other: 1 });
    // Twenty writers append at the same moment: a read-modify-write would lose most of them.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.appendItem("owner", "tasks", "t1", "notes", { id: `n${i}`, text: `note ${i}` }),
      ),
    );
    const afterAppends = await store.get<{ notes: { id: string }[]; other: number }>(
      "owner",
      "tasks",
      "t1",
    );
    assert.equal(afterAppends?.notes.length, 20);
    assert.deepEqual(new Set(afterAppends?.notes.map((note) => note.id)).size, 20);
    assert.equal(afterAppends?.other, 1, "other fields are untouched");

    // A field that does not exist yet is created.
    const created = await store.appendItem<{ files: { id: string }[] }>(
      "owner",
      "tasks",
      "t1",
      "files",
      { id: "f1" },
    );
    assert.deepEqual(created?.files, [{ id: "f1" }]);

    // `max` refuses an append to a full array, and a missing record yields null.
    assert.equal(
      await store.appendItem("owner", "tasks", "t1", "files", { id: "f2" }, { max: 1 }),
      null,
    );
    assert.equal(await store.appendItem("owner", "tasks", "missing", "files", { id: "f" }), null);
    assert.equal((await store.get<{ files: unknown[] }>("owner", "tasks", "t1"))?.files.length, 1);

    // `where` appends only while the record still matches, and `merge` lands in the same statement.
    assert.equal(
      await store.appendItem(
        "owner",
        "tasks",
        "t1",
        "notes",
        { id: "late" },
        { where: { status: "waiting_input" }, merge: { status: "queued" } },
      ),
      null,
      "a record that no longer matches `where` is left alone",
    );
    await store.compareAndSwap("owner", "tasks", "t1", {}, { status: "waiting_input" });
    const requeued = await store.appendItem<{ status: string; notes: { id: string }[] }>(
      "owner",
      "tasks",
      "t1",
      "notes",
      { id: "answer" },
      { where: { status: "waiting_input" }, merge: { status: "queued" } },
    );
    assert.equal(requeued?.status, "queued");
    assert.equal(requeued?.notes.at(-1)?.id, "answer");
    assert.equal(requeued?.notes.length, 21);
    await store.removeItem("owner", "tasks", "t1", "notes", "answer", { status: "paused" });
    assert.equal((await store.get<{ status: string }>("owner", "tasks", "t1"))?.status, "paused");

    // An item that is itself an array stays one entry.
    await store.appendItem("owner", "tasks", "t1", "pairs", ["a", "b"]);
    assert.deepEqual((await store.get<{ pairs: unknown[] }>("owner", "tasks", "t1"))?.pairs, [
      ["a", "b"],
    ]);

    // Patching touches only the listed entries, and keeps their order.
    const patched = await store.patchItems<{ notes: { id: string; seen?: boolean }[] }>(
      "owner",
      "tasks",
      "t1",
      "notes",
      ["n3", "n7"],
      { seen: true },
    );
    assert.deepEqual(
      patched?.notes.filter((note) => note.seen).map((note) => note.id),
      ["n3", "n7"],
    );
    assert.deepEqual(
      patched?.notes.map((note) => note.id),
      Array.from({ length: 20 }, (_, i) => `n${i}`),
    );

    // Removing drops one entry and nothing else.
    const removed = await store.removeItem<{ notes: { id: string }[] }>(
      "owner",
      "tasks",
      "t1",
      "notes",
      "n5",
    );
    assert.equal(removed?.notes.length, 19);
    assert.ok(!removed?.notes.some((note) => note.id === "n5"));
    assert.equal(await store.removeItem("owner", "tasks", "missing", "notes", "n1"), null);
    // Removing the last entry leaves an empty array, not a missing field.
    await store.removeItem("owner", "tasks", "t1", "files", "f1");
    assert.deepEqual((await store.get<{ files: unknown[] }>("owner", "tasks", "t1"))?.files, []);
  } finally {
    await store.close();
  }
});
