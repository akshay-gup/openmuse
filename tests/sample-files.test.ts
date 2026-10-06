import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { EventType } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import type { AgentService } from "../apps/server/src/engine/service.ts";
import { channelWorkspaceDir } from "../apps/server/src/engine/threads.ts";
import { ORCHESTRATOR_CHANNEL_ID } from "../packages/domain/src/agent.ts";
import {
  sentFileSchema,
  type UploadRequestState,
  uploadRequestSchema,
} from "../packages/domain/src/workspace-files.ts";

let db: Store, agent: AgentService, config: Config, directory: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-sample-files-"));
  db = await createStore();
  config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  };
  ({ agent } = await createApp(db, config));
  await agent.ensure("local-user");
});
after(async () => {
  await agent.stop();
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

/** The fields of an AG-UI event that these tests read. */
interface Event {
  type: EventType;
  toolCallId?: string;
  toolCallName?: string;
  delta?: string;
  content?: string;
}

async function sampleRun(content: string, threadId = "sample-files") {
  const events = (await lastValueFrom(
    new ConversationAgent(config, agent, "local-user")
      .run({
        threadId,
        runId: `run-${Math.random()}`,
        messages: [{ id: `m-${Math.random()}`, role: "user", content }],
        tools: [],
        context: [],
        state: {},
      })
      .pipe(toArray()),
  )) as unknown as Event[];
  const calls = events
    .filter((event) => event.type === EventType.TOOL_CALL_START)
    .map((start) => {
      const result = events.find(
        (event) =>
          event.type === EventType.TOOL_CALL_RESULT && event.toolCallId === start.toolCallId,
      );
      return {
        name: start.toolCallName,
        result: result?.content ? JSON.parse(result.content) : undefined,
      };
    });
  const text = events
    .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((event) => event.delta)
    .join("");
  return { events, calls, text };
}

test("asked to make something, the sample agent makes files and shares them with the real tool", async () => {
  const { calls, text, events } = await sampleRun("Can you make me a report on the launch?");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["send_file", "send_file"],
  );
  assert.match(text, /brief and a first pass at the page/);
  const [brief, page] = calls.map((call) => sentFileSchema.parse(call.result));
  assert.equal(brief.file.path, "samples/launch-brief.md");
  assert.equal(brief.file.kind, "markdown");
  assert.equal(brief.channelId, ORCHESTRATOR_CHANNEL_ID);
  assert.equal(page.file.kind, "html");
  assert.equal(page.caption, "A first pass at the page. Show the preview to try it.");
  // They are really in the workspace, and the events say the run finished cleanly.
  const workspace = channelWorkspaceDir(directory, "local-user", ORCHESTRATOR_CHANNEL_ID);
  assert.match(
    await readFile(join(workspace, "samples/launch-brief.md"), "utf8"),
    /^# Launch brief/,
  );
  assert.match(
    await readFile(join(workspace, "samples/launch-page.html"), "utf8"),
    /<h1>Work that feels calm/,
  );
  assert.equal(
    events.some((event) => event.type === EventType.RUN_ERROR),
    false,
  );
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
  // The tool arguments shown in the chat are small: the contents stay in the file.
  const start = events.find((event) => event.type === EventType.TOOL_CALL_START);
  const args = events.find(
    (event) => event.type === EventType.TOOL_CALL_ARGS && event.toolCallId === start?.toolCallId,
  );
  assert.deepEqual(JSON.parse(args?.delta ?? "null"), {
    path: "samples/launch-brief.md",
    caption: "The launch brief",
  });
});

test("asked to upload, the sample agent makes a real request and answers the upload when it comes", async () => {
  const { calls, text } = await sampleRun("I'd like to upload the brand guidelines");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["request_upload"],
  );
  assert.match(text, /need a file/);
  const request = uploadRequestSchema.parse(calls[0].result);
  assert.deepEqual(request.accept, ["pdf", "png", "md"]);
  const state = await agent.uploadRequests.get(
    "local-user",
    ORCHESTRATOR_CHANNEL_ID,
    request.requestId,
  );
  assert.equal((state satisfies UploadRequestState).prompt, request.prompt);
  // What the upload card says afterwards is answered without starting a task or asking again.
  const before = (await db.list("local-user", "tasks")).length;
  const answered = await sampleRun(
    "@hive I've uploaded the files you asked for:\n- uploads/brand.md (Markdown, 1 KB)",
  );
  assert.deepEqual(answered.calls, []);
  assert.match(answered.text, /Thanks, I can see them/);
  assert.equal((await db.list("local-user", "tasks")).length, before);
});

test("the demo phrases do not catch what the sample agent already answers", async () => {
  for (const [prompt, expected] of [
    ["Show my calendar", /Your local calendar has/],
    ["hello", /What would you like to take off your plate/],
    ["Complete the permission slip", /permission slip|PDF/],
  ] as const) {
    const { calls, text } = await sampleRun(prompt);
    assert.match(text, expected, prompt);
    assert.ok(
      !calls.some((call) => call.name === "send_file" || call.name === "request_upload"),
      prompt,
    );
  }
  // A request that mentions files without asking for one is just an ordinary request.
  assert.ok(
    !(await sampleRun("Please file my taxes")).calls.some((call) => call.name === "send_file"),
  );
});
