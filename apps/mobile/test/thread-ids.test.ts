import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveThreadId } from "../src/thread-ids.ts";

const channelThread = { id: "11111111-2222-4333-8444-555555555555", existing: true };

test("keyless channel thread selection does not collapse to local-main", () => {
  assert.equal(resolveThreadId(false, channelThread), channelThread.id);
});

test("keyless new channel thread keeps its binding id", () => {
  assert.equal(resolveThreadId(false, { ...channelThread, existing: false }), channelThread.id);
});

test("keyless main chat keeps the local-main id", () => {
  assert.equal(resolveThreadId(false, { id: "local", existing: false }), "local-main");
});

test("rich threads always use the selection id", () => {
  assert.equal(resolveThreadId(true, { id: "local", existing: false }), "local");
  assert.equal(resolveThreadId(true, channelThread), channelThread.id);
});
