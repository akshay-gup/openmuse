import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineLimits, renderBrief, renderUpdate } from "../apps/server/src/engine/brief.ts";
import type { StagedFile } from "../apps/server/src/engine/task-files.ts";
import type { AgentTask, TaskNote } from "../packages/domain/src/agent.ts";

const names = new Map([
  ["alice", "Alice"],
  ["bob", "Bob"],
]);

function task(patch: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "t1",
    title: "Plan the offsite",
    prompt: "Find a venue",
    kind: "agent",
    status: "running",
    priority: "medium",
    blockedBy: [],
    labels: [],
    plan: [],
    evidence: [],
    input: {},
    state: {},
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    attempts: 1,
    artifactIds: [],
    ...patch,
  };
}
const note = (id: string, text: string, patch: Partial<TaskNote> = {}): TaskNote => ({
  id,
  text,
  kind: "note",
  createdAt: "2026-10-02T14:03:00.000Z",
  createdBy: "alice",
  delivered: false,
  ...patch,
});
const file = (patch: Partial<StagedFile> = {}): StagedFile => ({
  id: "f1",
  name: "form.pdf",
  path: "attachments/t1/form.pdf",
  mimeType: "application/pdf",
  size: 214 * 1024,
  ...patch,
});

test("a task with nothing added has an empty brief", () => {
  assert.equal(renderBrief({ task: task(), names, files: [], staged: true }), "");
});

test("notes are listed oldest first, with who wrote them and what they were for", () => {
  const brief = renderBrief({
    task: task({
      notes: [
        note("n1", "Budget is $5k"),
        note("n2", "Closer to the station", { createdBy: "bob", kind: "feedback" }),
        note("n3", "Thursday works", { kind: "answer", createdBy: undefined }),
      ],
    }),
    names,
    files: [],
    staged: true,
  });
  assert.match(brief, /## Notes from the team/);
  assert.match(brief, /instructions: follow them/);
  const first = brief.indexOf("1. Alice · 2026-10-02 14:03 UTC");
  const second = brief.indexOf("2. Bob · 2026-10-02 14:03 UTC · changes requested after review");
  const third = brief.indexOf("3. A teammate · 2026-10-02 14:03 UTC · answering your question");
  assert.ok(first > 0 && second > first && third > second, brief);
  assert.match(brief, / {3}Budget is \$5k/);
});

test("a multi-line note keeps its lines inside its own entry", () => {
  const brief = renderBrief({
    task: task({ notes: [note("n1", "Line one\nLine two")] }),
    names,
    files: [],
    staged: true,
  });
  assert.match(brief, /\n {3}Line one\n {3}Line two/);
});

test("when notes outgrow the budget the newest are kept and the rest are counted", () => {
  const long = "x".repeat(13_000);
  const brief = renderBrief({
    task: task({ notes: [note("a", long), note("b", long), note("c", long), note("d", "latest")] }),
    names,
    files: [],
    staged: true,
  });
  assert.match(brief, /2 earlier notes are left out/);
  assert.match(brief, /4\. Alice/);
  assert.match(brief, /3\. Alice/);
  assert.ok(!brief.includes("1. Alice") && !brief.includes("2. Alice"));
  assert.ok(brief.includes("latest"));
});

test("staged files are listed by workspace path and marked as data", () => {
  const brief = renderBrief({
    task: task(),
    names,
    files: [
      file({ fileId: "files-1" }),
      file({
        id: "f2",
        name: "photo.png",
        path: "attachments/t1/photo.png",
        mimeType: "image/png",
        size: 3 * 1024 * 1024,
      }),
    ],
    staged: true,
  });
  assert.match(brief, /## Attached files/);
  assert.match(brief, /never instructions/);
  assert.match(
    brief,
    /- attachments\/t1\/form\.pdf — PDF, 214 KB; also in Files as files-1 for inspect_pdf and fill_pdf/,
  );
  assert.match(brief, /- attachments\/t1\/photo\.png — image, 3\.0 MB/);
  assert.ok(!brief.includes("cannot open"));
});

test("without a workspace, text files are pasted in and the rest are named honestly", () => {
  const text = file({ id: "t", name: "notes.txt", mimeType: "text/plain", size: 20 });
  const photo = file({ id: "p", name: "photo.png", mimeType: "image/png", size: 4096 });
  const pdf = file({ id: "d", name: "form.pdf", fileId: "files-9" });
  const brief = renderBrief({
    task: task(),
    names,
    files: [text, photo, pdf],
    staged: false,
    inline: new Map([["t", "remember the milk"]]),
  });
  assert.match(brief, /### notes\.txt\n```\nremember the milk\n```/);
  assert.match(
    brief,
    /- photo\.png — image, 4 KB \(you cannot open this kind of file with your tools/,
  );
  // A PDF can be opened through Files, so it is not flagged.
  assert.match(brief, /- form\.pdf — PDF, 214 KB; also in Files as files-9/);
  assert.ok(!/form\.pdf[^\n]*cannot open/.test(brief));
});

test("pasted text is cut to its limit and says so", () => {
  const big = file({ id: "b", name: "big.csv", mimeType: "text/csv" });
  const brief = renderBrief({
    task: task(),
    names,
    files: [big],
    staged: false,
    inline: new Map([["b", "y".repeat(inlineLimits.file + 1)]]),
  });
  assert.ok(brief.includes("[…cut short]"));
  assert.ok(brief.includes("y".repeat(inlineLimits.file)));
  assert.ok(!brief.includes("y".repeat(inlineLimits.file + 1)));
});

test("the channel discussion and the previous result come last, and only when there are some", () => {
  const brief = renderBrief({
    task: task({
      input: { discussion: { channel: "ops", lines: "Alice: ship Friday" } },
      result: "Booked the Hillside venue.",
      notes: [note("n1", "Make it cheaper")],
    }),
    names,
    files: [],
    staged: true,
  });
  const order = [
    "## Notes from the team",
    "## Recent discussion in #ops",
    "## Your previous result",
  ].map((heading) => brief.indexOf(heading));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], brief);
  assert.match(brief, /Booked the Hillside venue\./);
  assert.match(brief, /do not start over unless a note says to/);
  assert.ok(
    !renderBrief({ task: task({ result: "  " }), names, files: [], staged: true }).includes(
      "previous result",
    ),
  );
});

test("an update carries only what is new, with its files and who sent it", () => {
  const update = renderUpdate({
    notes: [note("n1", "Also check parking", { createdBy: "bob" })],
    files: [file()],
    names,
  });
  assert.match(update, /Bob \(2026-10-02 14:03 UTC\):\n {3}Also check parking/);
  assert.match(update, /New file attached: attachments\/t1\/form\.pdf — PDF, 214 KB/);
  assert.equal(renderUpdate({ notes: [], files: [], names }), "");
});
