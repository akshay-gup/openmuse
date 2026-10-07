import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStore } from "../apps/server/src/db.ts";
import { TaskRunLog } from "../apps/server/src/opencode/task-run-log.ts";
import type { RunEvent } from "../packages/domain/src/agent.ts";

test("task transcripts persist streamed text, tool states and full final messages without duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hive-run-log-"));
  const db = await createStore({ dataDir: join(directory, "postgres") });
  let active = true;
  const log = new TaskRunLog(db, "alice", "task-1", "run-1", async () => {
    if (!active) throw new Error("Lost lease");
  });
  // OpenCode gives every event an id of its own.
  let events = 0;
  const event = (type: string, properties: Record<string, unknown>) => ({
    id: `event-${++events}`,
    type,
    properties,
  });
  const part = (id: string, type: string, extra: Record<string, unknown> = {}) =>
    event("message.part.updated", { part: { id, messageID: "assistant-1", type, ...extra } });
  try {
    log.handle(part("text-1", "text", { text: "Starting" }));
    log.handle(event("message.updated", { info: { id: "assistant-1", role: "assistant" } }));
    log.handle(
      event("message.part.delta", {
        messageID: "assistant-1",
        partID: "text-1",
        field: "text",
        delta: " now",
      }),
    );
    await log.flush();
    let records = await db.list<RunEvent>("alice", "run-events");
    assert.equal(records[0].detail, "Starting now");
    log.handle(part("text-1", "text", { text: "Starting now" }));
    log.handle(part("thinking", "reasoning", { text: "Private reasoning" }));
    log.handle(part("synthetic", "text", { text: "Internal context", synthetic: true }));
    log.handle(event("message.updated", { info: { id: "user-1", role: "user" } }));
    log.handle(
      event("message.part.updated", {
        part: { id: "user-text", messageID: "user-1", type: "text", text: "User message" },
      }),
    );
    log.handle(
      part("tool-1", "tool", {
        tool: "hive_0123456789abcdef_create_issue",
        callID: "call-1",
        state: { status: "running", input: { title: "Task" } },
      }),
    );
    await log.flush();
    log.handle(
      part("tool-1", "tool", {
        tool: "hive_0123456789abcdef_create_issue",
        callID: "call-1",
        state: { status: "completed", input: { title: "Task" }, output: '{"id":"issue-1"}' },
      }),
    );
    log.handle(
      part("text-2", "text", { text: "Created the issue.\nTASK_COMPLETE: Created the issue." }),
    );
    await log.close();
    records = await db.list<RunEvent>("alice", "run-events");
    assert.equal(records.length, 3);
    assert.equal(records.find((r) => r.kind === "tool")?.toolState, "completed");
    assert.equal(records.find((r) => r.kind === "tool")?.toolName, "create_issue");
    assert.ok(records.some((r) => r.detail.includes("TASK_COMPLETE:")));
    // Run transcripts belong to the workspace, so a teammate reads the same events.
    assert.equal((await db.list("bob", "run-events")).length, 3);
    active = false;
    log.handle(part("late", "text", { text: "Must not persist after cancellation" }));
    await assert.rejects(log.close(), /Lost lease/);
    assert.equal((await db.list("alice", "run-events")).length, 3);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
