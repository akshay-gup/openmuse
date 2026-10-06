import assert from "node:assert/strict";
import test from "node:test";
import {
  emailDraftSchema,
  eventDraftSchema,
  proposalSchema,
} from "../packages/domain/src/index.ts";

const email = {
  to: ["reader@example.com"],
  subject: "Your visit",
  body: "See you soon.",
};
const event = {
  title: "Museum visit",
  start: "2026-10-10T10:00:00-07:00",
  end: "2026-10-10T14:00:00-07:00",
};

test("email drafts default cc, bcc, and attachmentIds to empty arrays", () => {
  const parsed = emailDraftSchema.parse(email);
  assert.deepEqual(parsed.cc, []);
  assert.deepEqual(parsed.bcc, []);
  assert.deepEqual(parsed.attachmentIds, []);
});

test("email drafts reject a subject containing a line break", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, subject: "Visit\nplan" }).success, false);
  assert.equal(emailDraftSchema.safeParse({ ...email, subject: "Visit\rplan" }).success, false);
});

test("email drafts enforce recipient, cc/bcc, and attachment limits", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, to: [] }).success, false);
  assert.equal(
    emailDraftSchema.safeParse({
      ...email,
      cc: Array.from({ length: 51 }, (_, i) => `person${i}@example.com`),
    }).success,
    false,
  );
  assert.equal(
    emailDraftSchema.safeParse({
      ...email,
      attachmentIds: Array.from({ length: 11 }, (_, i) => `file-${i}`),
    }).success,
    false,
  );
});

test("email drafts reject malformed addresses", () => {
  assert.equal(emailDraftSchema.safeParse({ ...email, to: ["not-an-email"] }).success, false);
});

test("timed events require an explicit UTC offset", () => {
  assert.equal(eventDraftSchema.parse(event).timeZone, "America/Los_Angeles");
  assert.equal(
    eventDraftSchema.safeParse({ ...event, start: "2026-10-10T10:00:00" }).success,
    false,
  );
  assert.equal(
    eventDraftSchema.safeParse({ ...event, start: "2026-10-10T10:00:00Z" }).success,
    true,
  );
});

test("all-day events reject a full timestamp in place of a date", () => {
  const allDay = { ...event, allDay: true, start: "2026-10-10", end: "2026-10-11" };
  assert.equal(eventDraftSchema.parse(allDay).allDay, true);
  assert.equal(
    eventDraftSchema.safeParse({ ...allDay, start: "2026-10-10T00:00:00Z" }).success,
    false,
  );
});

test("events reject an end at or before the start", () => {
  assert.equal(
    eventDraftSchema.safeParse({ ...event, end: "2026-10-09T10:00:00-07:00" }).success,
    false,
  );
  assert.equal(eventDraftSchema.safeParse({ ...event, end: event.start }).success, false);
});

test("events default calendarId, location, and description", () => {
  const parsed = eventDraftSchema.parse(event);
  assert.equal(parsed.calendarId, "primary");
  assert.equal(parsed.location, "");
  assert.equal(parsed.description, "");
});

test("proposal schema discriminates on kind and validates nested data", () => {
  assert.equal(proposalSchema.safeParse({ kind: "email.send", data: email }).success, true);
  assert.equal(
    proposalSchema.safeParse({ kind: "email.send", data: { ...email, subject: "" } }).success,
    false,
  );
  assert.equal(proposalSchema.safeParse({ kind: "unknown.kind", data: {} }).success, false);
});

test("work waiting for review is in progress, not done", async () => {
  const { taskColumn } = await import("../packages/domain/src/agent.ts");
  assert.equal(taskColumn("in_review"), "doing");
  assert.equal(taskColumn("succeeded"), "done");
});

test("a task's notes and files have fixed limits, and the agent is offered the types it can read", async () => {
  const { addNoteSchema, attachmentTypes, taskBriefLimits, updateTaskSchema } = await import(
    "../packages/domain/src/agent.ts"
  );
  assert.equal(addNoteSchema.safeParse({ text: "  hello  " }).data?.text, "hello");
  assert.equal(addNoteSchema.safeParse({ text: "   " }).success, false);
  assert.equal(
    addNoteSchema.safeParse({ text: "x".repeat(taskBriefLimits.noteChars) }).success,
    true,
  );
  assert.equal(
    addNoteSchema.safeParse({ text: "x".repeat(taskBriefLimits.noteChars + 1) }).success,
    false,
  );
  assert.equal(addNoteSchema.safeParse({ text: "go", run: true }).data?.run, true);
  // No type that a browser would run from a download.
  for (const extension of Object.keys(attachmentTypes))
    assert.ok(!/^\.(?:html?|svg|js|mjs|xml|exe|sh)$/.test(extension), extension);
  assert.equal(attachmentTypes[".pdf"], "application/pdf");
  // Review is a status a task can be moved to by name, and an empty description is allowed.
  assert.equal(updateTaskSchema.safeParse({ status: "in_review" }).success, true);
  assert.equal(updateTaskSchema.safeParse({ prompt: "" }).success, true);
  assert.equal(updateTaskSchema.safeParse({ channelContext: false }).success, true);
});

test("files are told apart by name: how they are shown, and what a browser may do with them", async () => {
  const { channelFileLimits, describeFile, textKinds } = await import(
    "../packages/domain/src/workspace-files.ts"
  );
  assert.deepEqual(describeFile("report.PDF"), { mimeType: "application/pdf", kind: "pdf" });
  assert.deepEqual(describeFile("photo.jpeg"), { mimeType: "image/jpeg", kind: "image" });
  assert.equal(describeFile("notes.md").kind, "markdown");
  assert.equal(describeFile("data.tsv").kind, "csv");
  assert.equal(describeFile("clip.mov").mimeType, "video/quicktime");
  assert.equal(describeFile("site/index.html").kind, "html");
  // A page's own scripts and styles keep their types, or a browser refuses to use them.
  assert.equal(describeFile("app.js").mimeType, "text/javascript");
  assert.equal(describeFile("site.css").mimeType, "text/css");
  // Every other source file is plain text, so it is shown and never run.
  for (const name of ["main.ts", "tool.py", "setup.sh", "config.yaml", "feed.xml"])
    assert.deepEqual(describeFile(name), { mimeType: "text/plain", kind: "code" }, name);
  // Unknown and extensionless names are downloads; a leading dot is not an extension.
  for (const name of ["README", ".gitignore", "blob.xyz", "archive."])
    assert.deepEqual(describeFile(name), { mimeType: "application/octet-stream", kind: "other" });
  assert.equal(describeFile("bundle.zip").kind, "archive");
  assert.ok(textKinds.has("markdown") && textKinds.has("code") && !textKinds.has("image"));
  assert.ok(channelFileLimits.writeBytes < channelFileLimits.uploadBytes);
});
