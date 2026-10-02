import assert from "node:assert/strict";
import test from "node:test";
import { countThreadReplies } from "../src/thread-replies.ts";

test("counts replies after the parent while excluding context and tool messages", () => {
  assert.equal(countThreadReplies([
    { id: "context", role: "user" }, { id: "parent", role: "user" },
    { id: "reply", role: "user" }, { id: "tool", role: "tool" },
    { id: "answer", role: "assistant" },
  ], "parent"), 2);
});
test("an empty thread or parent-only thread has no replies", () => {
  assert.equal(countThreadReplies([], "parent"), 0);
  assert.equal(countThreadReplies([{ id: "parent", role: "user" }], "parent"), 0);
});
test("legacy threads without a saved parent count their conversation messages", () => {
  assert.equal(countThreadReplies([{ id: "reply", role: "user" }], "parent"), 1);
});
