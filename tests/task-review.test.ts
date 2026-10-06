import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { AgentTask, AgentWorkspace } from "../packages/domain/src/agent.ts";
import { taskBriefLimits } from "../packages/domain/src/agent.ts";

/** Notes on a task: what the team tells the agent besides the task itself. */

let db: Store, server: Awaited<ReturnType<typeof createApp>>, directory: string, token: string;
const person = "local-user";

const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const request = (path: string, body?: unknown, method?: string) =>
  server.app.request(`/api/agent${path}`, {
    headers: headers(),
    ...(body === undefined && method === undefined
      ? {}
      : {
          method: method ?? "POST",
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
  });
async function read<T>(path: string, body?: unknown, status = 200, method?: string): Promise<T> {
  const response = await request(path, body, method);
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
const force = (id: string, patch: Record<string, unknown>) =>
  db.compareAndSwap("shared", "tasks", id, {}, patch);
const create = (body: Record<string, unknown> = {}) =>
  read<AgentTask>("/tasks", { title: "A task", prompt: "Do the thing", ...body }, 201);
/** An agent task the agent has handed in. */
async function inReview(body: Record<string, unknown> = {}) {
  const task = await create(body);
  await force(task.id, { status: "in_review", result: "Here is what I did.", attempts: 1 });
  return task;
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-task-review-"));
  db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    intelligenceApiKey: "test-project-key-never-sent",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config);
  const session = await server.app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
  await db.put("system", "users", { id: person, name: "Pat" });
  await db.put("system", "users", { id: "alice", name: "Alice" });
  await db.put("system", "users", { id: "bob", name: "Bob" });
});
after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

// ---- Notes -----------------------------------------------------------------------------------

test("a note records who wrote it and is not yet read by the agent", async () => {
  const task = await create();
  const noted = await read<AgentTask>(
    `/tasks/${task.id}/notes`,
    { text: "  Budget is $5k  " },
    201,
  );
  assert.equal(noted.notes?.length, 1);
  const [note] = noted.notes ?? [];
  assert.equal(note.text, "Budget is $5k");
  assert.equal(note.kind, "note");
  assert.equal(note.delivered, false);
  assert.equal(note.createdBy, person);
  assert.equal(note.createdByName, "Pat");
  assert.equal(note.mine, true);
  assert.equal(noted.status, "queued", "a plain note does not change what the task is doing");

  // Others see it as theirs-not-mine, and it travels with the workspace snapshot.
  await server.agent.addNote("alice", task.id, { text: "Near the station" });
  const snapshot = (await read<AgentWorkspace>("")).tasks.find((t) => t.id === task.id);
  assert.deepEqual(
    snapshot?.notes?.map((n) => [n.createdByName, n.mine]),
    [
      ["Pat", true],
      ["Alice", false],
    ],
  );
  const events = (await server.agent.detail(person, task.id)).events;
  assert.ok(events.some((e) => e.kind === "instruction" && e.title === "Pat added a note"));
});

test("notes are validated and limited", async () => {
  const task = await create();
  await read(`/tasks/${task.id}/notes`, { text: "   " }, 422);
  await read(`/tasks/${task.id}/notes`, { text: "x".repeat(taskBriefLimits.noteChars + 1) }, 422);
  await read("/tasks/nope/notes", { text: "hi" }, 404);
  for (let i = 0; i < taskBriefLimits.notes; i++)
    await server.agent.addNote(person, task.id, { text: `note ${i}` });
  const full = await read<{ error: string }>(`/tasks/${task.id}/notes`, { text: "one more" }, 409);
  assert.match(full.error, /50 notes/);
});

test("changes requested in review go back to the agent with the note, in one step", async () => {
  const task = await inReview();
  const back = await read<AgentTask>(
    `/tasks/${task.id}/notes`,
    { text: "Cheaper, please", run: true },
    201,
  );
  assert.equal(back.status, "queued");
  assert.equal(back.leaseId, null);
  assert.equal(back.result, "Here is what I did.", "the previous result stays for the next run");
  assert.deepEqual(
    back.notes?.map((n) => [n.text, n.kind, n.delivered]),
    [["Cheaper, please", "feedback", false]],
  );
  const events = (await server.agent.detail(person, task.id)).events;
  assert.ok(events.some((e) => e.title === "Pat asked for changes"));
});

test("a note with run reopens failed, cancelled and finished tasks, and answers a question", async () => {
  for (const [status, kind] of [
    ["failed", "note"],
    ["cancelled", "note"],
    ["succeeded", "note"],
    ["waiting_input", "answer"],
  ] as const) {
    const task = await create();
    await force(task.id, { status, error: "Boom", question: "Which day?" });
    const back = await read<AgentTask>(
      `/tasks/${task.id}/notes`,
      { text: "Try again with Thursday", run: true },
      201,
    );
    assert.equal(back.status, "queued", status);
    assert.equal(back.error, null, status);
    assert.equal(back.question, null, status);
    assert.equal(back.notes?.[0].kind, kind, status);
  }
});

test("a note with run leaves a task that is already moving alone", async () => {
  for (const status of ["running", "queued", "paused", "waiting_approval"]) {
    const task = await create();
    await force(task.id, { status, ...(status === "running" ? { leaseId: "lease" } : {}) });
    const same = await read<AgentTask>(`/tasks/${task.id}/notes`, { text: "FYI", run: true }, 201);
    assert.equal(same.status, status);
    assert.equal(same.notes?.length, 1);
  }
});

test("sending a task back after a failure takes the same care as a retry", async () => {
  await db.put("shared", "actions", { id: "denied-action", status: "denied" });
  const failed = await create();
  await force(failed.id, { status: "failed", actionId: "denied-action" });
  const refused = await read<{ error: string }>(
    `/tasks/${failed.id}/notes`,
    { text: "again", run: true },
    409,
  );
  assert.match(refused.error, /Check the reviewed action/);
  assert.equal(
    (await server.agent.getTask(person, failed.id)).notes,
    undefined,
    "no note was kept",
  );

  // A task that is simply waiting for its review is not disturbed by a note, whatever it holds.
  const waiting = await create();
  await force(waiting.id, { status: "waiting_approval", actionId: "denied-action" });
  const noted = await read<AgentTask>(
    `/tasks/${waiting.id}/notes`,
    { text: "FYI", run: true },
    201,
  );
  assert.equal(noted.status, "waiting_approval");
});

test("a note cannot start a run for a task that has no agent behind it", async () => {
  const issue = await create({ kind: "manual", prompt: undefined });
  const refused = await read<{ error: string }>(
    `/tasks/${issue.id}/notes`,
    { text: "go", run: true },
    422,
  );
  assert.match(refused.error, /Hand this task to the agent/);
  // But a person can still leave notes on an issue.
  assert.equal(
    (await read<AgentTask>(`/tasks/${issue.id}/notes`, { text: "Context" }, 201)).notes?.length,
    1,
  );
  const finance = await create({ kind: "finance", input: {} });
  await force(finance.id, { status: "succeeded" });
  const workflow = await read<{ error: string }>(
    `/tasks/${finance.id}/notes`,
    { text: "again", run: true },
    422,
  );
  assert.match(workflow.error, /does not take notes/);
});

test("answering a question adds the answer to the task's notes and queues it in one step", async () => {
  const task = await create();
  await force(task.id, { status: "waiting_input", question: "Which venue?" });
  const answered = await read<AgentTask>(`/tasks/${task.id}/input`, {
    answer: "The Hillside",
    fields: { venue: "Hillside" },
  });
  assert.equal(answered.status, "queued");
  assert.equal(answered.question, null);
  assert.deepEqual(answered.input.fields, { venue: "Hillside" });
  assert.equal(answered.state.answer, undefined, "answers are notes now, not a single saved value");
  assert.deepEqual(
    answered.notes?.map((n) => [n.text, n.kind]),
    [["The Hillside", "answer"]],
  );
  // A second answer cannot overwrite the first: the task is no longer waiting.
  await read(`/tasks/${task.id}/input`, { answer: "Another" }, 409);
});

test("only the author removes a note, and only before the agent has read it", async () => {
  const task = await create();
  const withNote = await server.agent.addNote("alice", task.id, { text: "Mine" });
  const note = withNote.notes?.[0];
  assert.ok(note);
  await assert.rejects(server.agent.removeNote("bob", task.id, note.id), /your own notes/);
  await assert.rejects(server.agent.removeNote("alice", task.id, "nope"), /Note not found/);

  await server.agent.markNotesDelivered("alice", task.id, [note.id]);
  await assert.rejects(
    server.agent.removeNote("alice", task.id, note.id),
    /already read this note/,
  );

  const second = await server.agent.addNote("alice", task.id, { text: "Second" });
  const removable = second.notes?.find((n) => n.text === "Second");
  assert.ok(removable);
  const after = await server.agent.removeNote("alice", task.id, removable.id);
  assert.deepEqual(
    after.notes?.map((n) => n.text),
    ["Mine"],
  );
});

test("notes added at the same moment are all kept", async () => {
  const task = await create();
  await Promise.all(
    Array.from({ length: 15 }, (_, i) => server.agent.addNote(person, task.id, { text: `n${i}` })),
  );
  assert.equal((await server.agent.getTask(person, task.id)).notes?.length, 15);
});
