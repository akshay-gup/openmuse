import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
import { createApp } from "../apps/server/src/app.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";

let db: Store, directory: string, token: string;
let app: Awaited<ReturnType<typeof createApp>>["app"];
const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-no-intelligence-"));
  db = await createStore();
  // No intelligenceApiKey: the server must boot and serve fully local.
  ({ app } = await createApp(db, {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  }));
  const session = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  token = (await session.json()).token;
});

after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

test("the app boots without an Intelligence key and serves main-thread locally", async (t) => {
  const calls: unknown[] = [];
  t.mock.method(CopilotKitIntelligence.prototype, "getOrCreateThread", async (input: unknown) => {
    calls.push(input);
    return { id: "should-not-happen" };
  });
  const first = await app.request("/api/main-thread", { headers: headers() });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.existing, true);
  assert.ok(typeof firstBody.threadId === "string" && firstBody.threadId.length > 0);
  const secondBody = await (await app.request("/api/main-thread", { headers: headers() })).json();
  assert.equal(secondBody.threadId, firstBody.threadId);
  assert.equal(calls.length, 0);
});

test("workspace reports richThreads off without an Intelligence key", async () => {
  const response = await app.request("/api/workspace", { headers: headers() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runtime.richThreads, false);
});

test("keyless channel threads persist conversations per thread id", async () => {
  const threadId = "11111111-2222-4333-8444-555555555555";
  const threadMessages = [{ id: "m1", role: "user", content: "hello channel" }];
  const mainMessages = [{ id: "m2", role: "user", content: "hello main" }];
  const putThread = await app.request(`/api/conversation?threadId=${threadId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ messages: threadMessages }),
  });
  assert.equal(putThread.status, 200);
  const putMain = await app.request("/api/conversation", {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ messages: mainMessages }),
  });
  assert.equal(putMain.status, 200);

  const threadBody = await (
    await app.request(`/api/conversation?threadId=${threadId}`, { headers: headers() })
  ).json();
  assert.deepEqual(threadBody.messages, threadMessages);

  // The main chat keeps the legacy "default" record, isolated from threads.
  const mainBody = await (await app.request("/api/conversation", { headers: headers() })).json();
  assert.deepEqual(mainBody.messages, mainMessages);

  // An unknown thread id hydrates empty rather than leaking another record.
  const otherBody = await (
    await app.request("/api/conversation?threadId=22222222-3333-4444-8555-666666666666", {
      headers: headers(),
    })
  ).json();
  assert.deepEqual(otherBody.messages, []);
});
