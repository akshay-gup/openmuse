import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { adoptSharedTranscripts } from "../apps/server/src/engine/shared-conversations.ts";
import type { ChannelThread } from "../packages/domain/src/agent.ts";

/**
 * Hive is a team workspace: channels and threads, with the agent's replies in them, are shared by
 * everyone who is signed in. Only the orchestrator chat stays private.
 */

const ALICE = "google:alice";
const BOB = "google:bob";
let db: Store, server: Awaited<ReturnType<typeof createApp>>, directory: string;
let tokenA = "",
  tokenB = "";

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
function call(token: string, path: string, body?: unknown, method?: string) {
  return server.app.request(path, {
    headers: headers(token),
    ...(body === undefined && method === undefined
      ? {}
      : {
          method: method ?? "POST",
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
  });
}
async function read<T>(
  token: string,
  path: string,
  body?: unknown,
  status = 200,
  method?: string,
): Promise<T> {
  const response = await call(token, path, body, method);
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
const agent = <T>(token: string, path: string, body?: unknown, status = 200, method?: string) =>
  read<T>(token, `/api/agent${path}`, body, status, method);
type Transcript = { messages: { id: string; role: string; content?: unknown; name?: string }[] };
const transcript = (token: string, threadId: string) =>
  read<Transcript>(token, `/api/conversation?threadId=${encodeURIComponent(threadId)}`);
const saveTranscript = (token: string, threadId: string, messages: unknown[]) =>
  read(
    token,
    `/api/conversation?threadId=${encodeURIComponent(threadId)}`,
    { messages },
    200,
    "PUT",
  );

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-shared-"));
  db = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  server = await createApp(db, config);
  tokenA = (await server.auth.sessionForOwner(ALICE)).token;
  tokenB = (await server.auth.sessionForOwner(BOB)).token;
  await db.put("system", "users", { id: ALICE, name: "Alice", email: "alice@example.com" });
  await db.put("system", "users", { id: BOB, name: "Bob", email: "bob@example.com" });
  await agent(tokenA, "/channels");
  await agent(tokenB, "/channels");
  await agent(tokenA, "/channels", { name: "Team" }, 201);
});
after(async () => {
  await server?.agent?.stop();
  await db?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

let thread: ChannelThread;
test("a thread's messages and the agent's replies are visible to everyone in the channel", async () => {
  thread = await agent<ChannelThread>(
    tokenA,
    "/channels/team/threads",
    { name: "Plan", parentMessageId: "root" },
    201,
  );
  await saveTranscript(tokenA, thread.threadId, [
    { id: "u1", role: "user", content: "@hive draft the launch plan" },
    { id: "a1", role: "assistant", content: "Here is a first draft." },
  ]);
  const seenByBob = await transcript(tokenB, thread.threadId);
  assert.deepEqual(
    seenByBob.messages.map((m) => [m.id, m.role, m.name]),
    [
      ["u1", "user", "Alice"],
      ["a1", "assistant", undefined],
    ],
  );
});

test("replies from different people merge into one thread", async () => {
  await saveTranscript(tokenB, thread.threadId, [
    { id: "u1", role: "user", content: "@hive draft the launch plan" },
    { id: "a1", role: "assistant", content: "Here is a first draft." },
    { id: "u2", role: "user", content: "Add a rollback step" },
  ]);
  // Alice's client had not loaded Bob's reply when it saved again.
  await saveTranscript(tokenA, thread.threadId, [
    { id: "u1", role: "user", content: "@hive draft the launch plan" },
    { id: "a1", role: "assistant", content: "Here is a first draft." },
    { id: "a2", role: "assistant", content: "Anything else?" },
  ]);
  const seen = await transcript(tokenB, thread.threadId);
  assert.deepEqual(
    seen.messages.map((m) => [m.id, m.name]),
    [
      ["u1", "Alice"],
      ["a1", undefined],
      ["u2", "Bob"],
      ["a2", undefined],
    ],
  );
});

test("a thread forked from a channel keeps the channel's authors on the seeded messages", async () => {
  await saveTranscript(tokenA, "channel:team", [
    { id: "c1", role: "user", content: "Launch is Friday" },
  ]);
  const forked = await agent<ChannelThread>(
    tokenB,
    "/channels/team/threads",
    { name: "Friday", parentMessageId: "c1" },
    201,
  );
  // Bob forks the thread; the client seeds it with the channel messages it was showing.
  await saveTranscript(tokenB, forked.threadId, [
    { id: "c1", role: "user", content: "Launch is Friday" },
    { id: "u9", role: "user", content: "@hive what is left?" },
  ]);
  const seen = await transcript(tokenA, forked.threadId);
  assert.deepEqual(
    seen.messages.map((m) => [m.id, m.name]),
    [
      ["c1", "Alice"],
      ["u9", "Bob"],
    ],
  );
});

test("the orchestrator chat stays private, including its threads", async () => {
  const main = await agent<ChannelThread>(
    tokenA,
    "/threads/bind",
    { threadId: "orchestrator-thread-a", channelId: "orchestrator" },
    200,
  );
  assert.equal(main.channelId, "orchestrator");
  await saveTranscript(tokenA, main.threadId, [
    { id: "p1", role: "user", content: "private note to my orchestrator" },
  ]);
  assert.equal((await transcript(tokenA, main.threadId)).messages.length, 1);
  assert.deepEqual((await transcript(tokenB, main.threadId)).messages, []);
  // The legacy main conversation is private too.
  await read(
    tokenA,
    "/api/conversation",
    { messages: [{ id: "d1", role: "user", content: "x" }] },
    200,
    "PUT",
  );
  assert.deepEqual((await read<Transcript>(tokenB, "/api/conversation")).messages, []);
});

type RawDb = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
async function legacy(owner: string, kind: string, id: string, data: Record<string, unknown>) {
  // Written the way threads used to be saved: under whoever ran them.
  await (db as unknown as { db: RawDb }).db.query(
    "INSERT INTO records(owner,kind,id,data) VALUES($1,$2,$3,$4::jsonb)",
    [owner, kind, id, JSON.stringify({ id, ...data })],
  );
}

test("threads saved under whoever ran them are adopted once; orchestrator threads stay put", async () => {
  const oldThread = await server.agent.registerThread(ALICE, "team", "Old thread");
  await legacy(ALICE, "conversations", oldThread.threadId, {
    messages: [
      { id: "lu1", role: "user", content: "hello" },
      { id: "la1", role: "assistant", content: "hi" },
    ],
  });
  await server.agent.ensureThreadBinding(BOB, "bob-private", "orchestrator");
  await legacy(BOB, "conversations", "bob-private", {
    messages: [{ id: "bp1", role: "user", content: "mine" }],
  });

  assert.equal(await adoptSharedTranscripts(db, server.agent.threads), 1);
  const adopted = await transcript(tokenB, oldThread.threadId);
  assert.deepEqual(
    adopted.messages.map((m) => [m.id, m.name]),
    [
      ["lu1", "Alice"],
      ["la1", undefined],
    ],
  );
  assert.equal((await transcript(tokenB, "bob-private")).messages.length, 1);
  assert.deepEqual((await transcript(tokenA, "bob-private")).messages, []);
  assert.equal(await adoptSharedTranscripts(db, server.agent.threads), 0);
});
