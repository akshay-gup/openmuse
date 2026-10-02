import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { TaskWorker } from "../apps/server/src/engine/worker.ts";
import type { AgentTask } from "../packages/domain/src/agent.ts";

let db: Store, server: Awaited<ReturnType<typeof createApp>>, directory: string, token: string;

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

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-task-board-"));
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
  assert.equal(session.status, 200);
  token = (await session.json()).token;
});
after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("manual issues create without a prompt and default sanely", async () => {
  const issue = await read<AgentTask>("/tasks", { title: "Buy milk", kind: "manual" }, 201);
  assert.equal(issue.kind, "manual");
  assert.equal(issue.status, "queued");
  assert.equal(issue.priority, "medium");
  assert.deepEqual(issue.blockedBy, []);
  assert.deepEqual(issue.labels, []);
  assert.deepEqual(issue.plan, []);
});

test("agent-executed tasks still require a prompt", async () => {
  await read("/tasks", { title: "No prompt", kind: "agent" }, 422);
});

test("manual tasks move freely across the board", async () => {
  const issue = await read<AgentTask>("/tasks", { title: "Move me", kind: "manual" }, 201);
  const running = await read<AgentTask>(`/tasks/${issue.id}`, { status: "running" }, 200, "PATCH");
  assert.equal(running.status, "running");
  const done = await read<AgentTask>(`/tasks/${issue.id}`, { status: "succeeded" }, 200, "PATCH");
  assert.equal(done.status, "succeeded");
});

test("worker tasks cannot be completed or run directly", async () => {
  const task = await read<AgentTask>(
    "/tasks",
    { title: "Worker job", prompt: "do work", kind: "agent" },
    201,
  );
  await read(`/tasks/${task.id}`, { status: "succeeded" }, 422, "PATCH");
  await read(`/tasks/${task.id}`, { status: "running" }, 422, "PATCH");
  const paused = await read<AgentTask>(`/tasks/${task.id}`, { status: "paused" }, 200, "PATCH");
  assert.equal(paused.status, "paused");
  const cancelled = await read<AgentTask>(
    `/tasks/${task.id}`,
    { status: "cancelled" },
    200,
    "PATCH",
  );
  assert.equal(cancelled.status, "cancelled");
});

test("terminal tasks cannot be reopened", async () => {
  const issue = await read<AgentTask>("/tasks", { title: "Done deal", kind: "manual" }, 201);
  await read(`/tasks/${issue.id}`, { status: "succeeded" }, 200, "PATCH");
  await read(`/tasks/${issue.id}`, { status: "queued" }, 409, "PATCH");
});

test("dependencies validate existence, self-reference, and cycles", async () => {
  const a = await read<AgentTask>("/tasks", { title: "A", kind: "manual" }, 201);
  const b = await read<AgentTask>("/tasks", { title: "B", kind: "manual" }, 201);
  await read(`/tasks/${b.id}`, { blockedBy: [a.id] }, 200, "PATCH");
  await read(`/tasks/${b.id}`, { blockedBy: [b.id] }, 422, "PATCH");
  await read(`/tasks/${b.id}`, { blockedBy: ["nope"] }, 404, "PATCH");
  await read(`/tasks/${a.id}`, { blockedBy: [b.id] }, 422, "PATCH");
});

test("dates validate ordering", async () => {
  await read(
    "/tasks",
    { title: "Bad dates", kind: "manual", startAt: "2026-10-05", dueAt: "2026-10-01" },
    422,
  );
  const issue = await read<AgentTask>(
    "/tasks",
    { title: "Dated", kind: "manual", startAt: "2026-10-01", dueAt: "2026-10-05" },
    201,
  );
  assert.equal(issue.startAt, "2026-10-01");
  assert.equal(issue.dueAt, "2026-10-05");
  await read(`/tasks/${issue.id}`, { dueAt: "2026-09-01" }, 422, "PATCH");
});

test("delete removes the task and cleans dependencies", async () => {
  const a = await read<AgentTask>("/tasks", { title: "Gone", kind: "manual" }, 201);
  const b = await read<AgentTask>("/tasks", { title: "Depends", kind: "manual" }, 201);
  await read(`/tasks/${b.id}`, { blockedBy: [a.id] }, 200, "PATCH");
  const deleted = await read<{ deleted: string }>(`/tasks/${a.id}`, undefined, 200, "DELETE");
  assert.equal(deleted.deleted, a.id);
  const after = await read<{ task: AgentTask }>(`/tasks/${b.id}`, undefined, 200, "GET");
  assert.deepEqual(after.task.blockedBy, []);
  await read(`/tasks/${a.id}`, undefined, 404, "GET");
});

test("the worker never claims manual tasks", async () => {
  const wdb = await createStore({ dataDir: join(directory, "wdb") });
  try {
    const manual: AgentTask = {
      id: "m-1",
      title: "Human job",
      prompt: "",
      kind: "manual",
      status: "queued",
      priority: "medium",
      blockedBy: [],
      labels: [],
      plan: [],
      evidence: [],
      input: {},
      state: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      leaseId: null,
      leaseUntil: null,
      artifactIds: [],
    };
    const agent: AgentTask = {
      ...manual,
      id: "a-1",
      kind: "agent",
      prompt: "work",
      title: "Agent job",
    };
    await wdb.put("owner", "tasks", manual);
    await wdb.put("owner", "tasks", agent);
    const claimed: string[] = [];
    await new TaskWorker(wdb, async (_owner, task) => {
      claimed.push(task.id);
      return { status: "succeeded" as const };
    }).tick();
    assert.deepEqual(claimed, ["a-1"]);
  } finally {
    await wdb.close();
  }
});
