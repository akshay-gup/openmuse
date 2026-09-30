import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTaskOutcome, TaskTextCollector } from "../apps/server/src/opencode/index.ts";

function partUpdated(messageID: string, text: string, synthetic = false) {
  return {
    id: `evt-${messageID}`,
    type: "message.part.updated",
    properties: {
      sessionID: "ses-1",
      part: { id: `part-${messageID}`, messageID, type: "text", synthetic, text },
    },
  };
}

function delta(messageID: string, text: string) {
  return {
    id: `evt-d-${messageID}`,
    type: "message.part.delta",
    properties: { sessionID: "ses-1", messageID, partID: `part-${messageID}`, delta: text },
  };
}

test("collector prefers snapshots and preserves message order", () => {
  const collector = new TaskTextCollector();
  collector.handle(partUpdated("m1", "hello "));
  collector.handle(delta("m1", "ignored after snapshot"));
  collector.handle({
    id: "mu",
    type: "message.updated",
    properties: { sessionID: "ses-1", info: { id: "m2", role: "assistant" } },
  });
  collector.handle(delta("m2", "streamed"));
  collector.handle(delta("m2", " text"));
  collector.handle(partUpdated("m3", "final"));
  assert.equal(collector.text(), "hello \n\nstreamed text\n\nfinal");
});

test("collector ignores synthetic parts and non-assistant deltas", () => {
  const collector = new TaskTextCollector();
  collector.handle(partUpdated("ctx", "[openmuse context] hidden", true));
  collector.handle(delta("user-msg", "user words"));
  collector.handle(partUpdated("m1", "visible"));
  assert.equal(collector.text(), "visible");
});

test("collector handles non-text parts without throwing", () => {
  const collector = new TaskTextCollector();
  collector.handle({
    id: "tool",
    type: "message.part.updated",
    properties: {
      sessionID: "ses-1",
      part: { id: "p1", messageID: "m1", type: "tool", callID: "c1", tool: "bash" },
    },
  });
  collector.handle({ id: "x", type: "session.status", properties: { sessionID: "ses-1" } });
  assert.equal(collector.text(), "");
});

test("parseTaskOutcome reads the last marker", () => {
  const text = [
    "Working on it.",
    "TASK_COMPLETE: first attempt summary",
    "Actually more to do.",
    "TASK_COMPLETE: final summary of the work",
  ].join("\n");
  assert.deepEqual(parseTaskOutcome(text), {
    kind: "complete",
    summary: "final summary of the work",
  });
});

test("parseTaskOutcome reads blocked markers", () => {
  assert.deepEqual(parseTaskOutcome("Stuck.\nTASK_BLOCKED: which account should I use?"), {
    kind: "blocked",
    question: "which account should I use?",
  });
});

test("parseTaskOutcome returns null without markers", () => {
  assert.equal(parseTaskOutcome("Just some text."), null);
  assert.equal(parseTaskOutcome("TASK_COMPLETE:"), null);
  assert.equal(parseTaskOutcome(""), null);
});
