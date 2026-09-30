import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  invalidRuleLines,
  PermissionRulesStore,
  PermissionTracker,
  taskSessionRuleset,
} from "../apps/server/src/opencode/index.ts";

let directory = "";
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-perms-"));
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Minimal bus: enqueue runs the action immediately, in order. */
const fakeBus = () => ({
  enqueue: <T>(_scope: string, action: () => Promise<T>): Promise<T> => action(),
});

interface ReplyCall {
  requestID: string;
  directory?: string;
  reply?: string;
}

function fakePool(calls: ReplyCall[], failOn?: string) {
  return {
    forDirectory: (dir: string) => ({
      permission: {
        reply: async (args: ReplyCall) => {
          calls.push({ ...args, directory: dir });
          if (failOn === args.requestID) return { error: { message: "gone" } };
          return {};
        },
      },
    }),
  };
}

const scope = {
  scope: "thread-1",
  threadId: "thread-1",
  channelId: "chan-1",
  directory: "/d/chan-1",
};

test("invalidRuleLines accepts valid rules and names bad ones", () => {
  assert.deepEqual(invalidRuleLines(["bash:git status:allow", "edit:deny", "", "  "]), []);
  assert.deepEqual(invalidRuleLines(["bash:git status:maybe"]), ["bash:git status:maybe"]);
  assert.deepEqual(invalidRuleLines(["nocolons"]), ["nocolons"]);
});

test("taskSessionRuleset is allow-all", () => {
  assert.deepEqual(taskSessionRuleset(), [{ permission: "*", pattern: "*", action: "allow" }]);
});

test("tracker records permission asks, deduped by request id", () => {
  const tracker = new PermissionTracker();
  const first = tracker.record(scope, {
    id: "req-1",
    sessionID: "ses-1",
    permission: "bash",
    patterns: ["rm *"],
  });
  const second = tracker.record(scope, {
    id: "req-1",
    sessionID: "ses-1",
    permission: "bash",
    patterns: ["rm *"],
  });
  assert.equal(first, second);
  assert.equal(tracker.pendingForThread("thread-1").length, 1);
  assert.equal(tracker.get("req-1")?.permission, "bash");
});

test("tracker scopes pending requests by thread", () => {
  const tracker = new PermissionTracker();
  tracker.record(scope, { id: "a", sessionID: "s", permission: "bash", patterns: [] });
  tracker.record(
    { scope: "thread-2", threadId: "thread-2", channelId: "chan-1", directory: "/d/chan-1" },
    { id: "b", sessionID: "s", permission: "edit", patterns: [] },
  );
  assert.equal(tracker.pendingForThread("thread-1").length, 1);
  assert.equal(tracker.pendingForThread("thread-2").length, 1);
  assert.ok(tracker.remove("a"));
  assert.equal(tracker.pendingForThread("thread-1").length, 0);
});

test("tracker.reply answers via the SDK and clears the request", async () => {
  const tracker = new PermissionTracker();
  const calls: ReplyCall[] = [];
  const deps = { bus: fakeBus(), pool: fakePool(calls) } as never;
  tracker.record(scope, { id: "req-9", sessionID: "ses-9", permission: "bash", patterns: ["*"] });
  const answered = await tracker.reply(deps, "req-9", "once");
  assert.equal(answered.requestId, "req-9");
  assert.deepEqual(calls, [{ requestID: "req-9", directory: "/d/chan-1", reply: "once" }]);
  assert.equal(tracker.get("req-9"), undefined);
});

test("tracker.reply throws for unknown request ids", async () => {
  const tracker = new PermissionTracker();
  const deps = { bus: fakeBus(), pool: fakePool([]) } as never;
  await assert.rejects(() => tracker.reply(deps, "nope", "reject"), /not pending/);
});

test("tracker.reply surfaces SDK errors without clearing", async () => {
  const tracker = new PermissionTracker();
  const calls: ReplyCall[] = [];
  const deps = { bus: fakeBus(), pool: fakePool(calls, "req-x") } as never;
  tracker.record(scope, { id: "req-x", sessionID: "s", permission: "bash", patterns: [] });
  await assert.rejects(() => tracker.reply(deps, "req-x", "reject"), /permission.reply failed/);
  assert.ok(tracker.get("req-x"), "failed reply stays pending");
});

test("rejectAllForScope rejects every pending request best-effort", async () => {
  const tracker = new PermissionTracker();
  const calls: ReplyCall[] = [];
  const deps = { bus: fakeBus(), pool: fakePool(calls) } as never;
  tracker.record(scope, { id: "r1", sessionID: "s", permission: "bash", patterns: [] });
  tracker.record(scope, { id: "r2", sessionID: "s", permission: "edit", patterns: [] });
  const rejected = await tracker.rejectAllForScope(deps, "thread-1");
  assert.equal(rejected, 2);
  assert.deepEqual(
    calls.map((c) => c.reply),
    ["reject", "reject"],
  );
  assert.equal(tracker.pendingForThread("thread-1").length, 0);
  assert.equal(await tracker.rejectAllForScope(deps, "thread-1"), 0);
});

test("rules store round-trips channel rules on disk", async () => {
  const store = new PermissionRulesStore(directory);
  assert.deepEqual(await store.channelRules("chan-a"), []);
  const saved = await store.setChannelRules("chan-a", ["bash:git *:allow", "edit:deny"]);
  assert.deepEqual(saved, ["bash:git *:allow", "edit:deny"]);
  assert.deepEqual(await store.channelRules("chan-a"), ["bash:git *:allow", "edit:deny"]);
  // A second instance sees the same file.
  assert.deepEqual(await new PermissionRulesStore(directory).channelRules("chan-a"), [
    "bash:git *:allow",
    "edit:deny",
  ]);
});

test("rules store rejects invalid rule lines", async () => {
  const store = new PermissionRulesStore(directory);
  await assert.rejects(
    () => store.setChannelRules("chan-a", ["bash:ls:allow", "bogus"]),
    /Invalid permission rules: bogus/,
  );
  await assert.rejects(
    () => store.setThreadRules("chan-a", "thread-1", ["also-bogus"]),
    /Invalid permission rules: also-bogus/,
  );
});

test("thread overrides merge after channel rules so they win", async () => {
  const store = new PermissionRulesStore(directory);
  await store.setChannelRules("chan-b", ["bash:*:ask"]);
  await store.setThreadRules("chan-b", "thread-9", ["bash:git status:allow"]);
  assert.deepEqual(await store.threadRules("chan-b", "thread-9"), ["bash:git status:allow"]);
  assert.deepEqual(await store.threadRules("chan-b", "other-thread"), []);
  const ruleset = await store.effectiveRules({
    threadId: "thread-9",
    channelId: "chan-b",
    name: "t",
    createdAt: "",
  });
  assert.deepEqual(ruleset, [
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "git status", action: "allow" },
  ]);
});

test("rules store sanitizes hostile channel ids to the workspace dir", async () => {
  const store = new PermissionRulesStore(directory);
  await store.setChannelRules("../../evil", ["edit:deny"]);
  assert.deepEqual(await store.channelRules("../../evil"), ["edit:deny"]);
  // Lands under channels/, not outside the data dir.
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(join(directory, "channels"));
  assert.ok(!names.includes(".."));
});
