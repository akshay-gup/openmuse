import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSharedFile, parseUploadRequest, uploadMessage } from "../src/tool-results.ts";

const sent = {
  sent: true,
  channelId: "design",
  file: {
    name: "q3.pdf",
    path: "reports/q3.pdf",
    size: 2048,
    modifiedAt: "2026-10-06T09:00:00.000Z",
    mimeType: "application/pdf",
    kind: "pdf",
  },
  caption: "The Q3 summary",
};

test("a shared file is read from the object or from the JSON text a chat holds", () => {
  for (const result of [sent, JSON.stringify(sent)]) {
    const parsed = parseSharedFile(result);
    assert.ok(parsed && "channelId" in parsed);
    assert.equal(parsed.file.path, "reports/q3.pdf");
    assert.equal(parsed.caption, "The Q3 summary");
  }
  // Extra fields are ignored, and the caption is optional.
  const bare = parseSharedFile({ ...sent, caption: undefined, extra: true });
  assert.ok(bare && "channelId" in bare && bare.caption === undefined);
});

test("a file that could not be shared gives the reason, and nothing else gives nothing", () => {
  assert.deepEqual(parseSharedFile('{"sent":false,"error":"File not found."}'), {
    error: "File not found.",
  });
  for (const result of [
    undefined,
    null,
    "",
    "not json",
    "[]",
    "42",
    {},
    { sent: true },
    { ...sent, file: { ...sent.file, kind: "spreadsheet" } },
    { ...sent, file: { name: "x" } },
    { sent: false },
  ])
    assert.equal(parseSharedFile(result), null, JSON.stringify(result));
});

const request = {
  requested: true,
  channelId: "design",
  requestId: "0123456789abcdef",
  prompt: "Please upload the brand guidelines",
  accept: ["pdf", "png"],
  multiple: true,
  folder: "uploads",
};

test("a request for files is read the same way", () => {
  for (const result of [request, JSON.stringify(request)]) {
    const parsed = parseUploadRequest(result);
    assert.ok(parsed && "channelId" in parsed);
    assert.equal(parsed.requestId, "0123456789abcdef");
    assert.deepEqual(parsed.accept, ["pdf", "png"]);
  }
  assert.deepEqual(parseUploadRequest('{"requested":false,"error":"Choose a different folder"}'), {
    error: "Choose a different folder",
  });
  for (const result of [
    undefined,
    "{",
    {},
    { requested: true },
    { ...request, multiple: "yes" },
    sent,
  ])
    assert.equal(parseUploadRequest(result), null, JSON.stringify(result));
  assert.equal(parseSharedFile(request), null);
});

test("the message to the agent names where each file is, so it can read them", () => {
  assert.equal(
    uploadMessage([
      { path: "uploads/Brand guide.pdf", name: "Brand guide.pdf", kind: "pdf", size: 1_300_000 },
    ]),
    "@hive I've uploaded the file you asked for:\n- uploads/Brand guide.pdf (PDF, 1.2 MB)",
  );
  const many = uploadMessage([
    { path: "uploads/logo.png", name: "logo.png", kind: "image", size: 80_000 },
    { path: "uploads/tokens.py", name: "tokens.py", kind: "code", size: 100 },
  ]);
  assert.equal(
    many,
    "@hive I've uploaded the files you asked for:\n- uploads/logo.png (Image, 78 KB)\n- uploads/tokens.py (PY, 1 KB)",
  );
  // It always mentions the agent, which is what makes an agent in a thread answer it.
  assert.match(many, /^@hive /);
});
