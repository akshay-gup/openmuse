import assert from "node:assert/strict";
import { test } from "node:test";
import type { JevAdapter, JevDecisionInput } from "../apps/server/src/jev/adapter.ts";
import { jevToolResultSchema } from "../packages/domain/src/jev.ts";
import { shimFixture } from "./helpers/shim.ts";

const explore = { id: "explore", label: "Explore exhibits", details: [], sources: [] };
const choices = (options: unknown[] = [explore]) => ({
  message: "Help with the trip",
  context: "A school email",
  title: "What next?",
  control: "clarification",
  options,
});

test("an agent is offered the choice cards, and told when to use them, only when they are on", async (t) => {
  const on = await shimFixture(t, { jevMode: "sample" });
  let offered: string[] = [];
  on.whenPrompted(({ tools, idle }) => {
    offered = tools;
    idle();
  });
  await on.run("@hive hello");
  assert.ok(offered.includes("present_choices"));
  assert.match(on.standIn.prompts[0].parts[0].text, /present_choices/);

  const off = await shimFixture(t);
  off.whenPrompted(({ tools, idle }) => {
    offered = tools;
    idle();
  });
  await off.run("@hive hello");
  assert.ok(!offered.includes("present_choices"));
  assert.doesNotMatch(off.standIn.prompts[0].parts[0].text, /present_choices/);
});

test("a panel reaches the chat whole, however long it is", async (t) => {
  const f = await shimFixture(t, { jevMode: "sample" });
  const many = Array.from({ length: 8 }, (_, index) => ({
    id: `step-${index}`,
    label: `Next step ${index}`,
    details: ["a".repeat(200), "b".repeat(200)],
    sources: [],
  }));
  f.whenPrompted(async ({ call, say, idle }) => {
    await call("present_choices", choices(many));
    say("Pick one.");
    idle();
  });
  const chat = await f.run("@hive Help me plan");
  const shown = chat.tools.find((tool) => tool.name === "present_choices");
  assert.ok(shown);
  // A result cut short is not JSON the card could read.
  assert.ok(shown.content.length > 2_000);
  const result = jevToolResultSchema.parse(shown.result);
  assert.equal(result.panel?.options.length, 8);
  assert.equal(result.panel?.mode, "sample");
  assert.equal(chat.last, "RUN_FINISHED");
});

test("the cards are judged against the person's own words, not the agent's summary of them", async (t) => {
  const seen: JevDecisionInput[] = [];
  const adapter: JevAdapter = {
    decide: async (input) => {
      seen.push(input);
      return { control: "clarification", scores: { explore: 1 } };
    },
  };
  const f = await shimFixture(t, { jevMode: "sample", jevAdapter: adapter });
  f.whenPrompted(async ({ call, idle }) => {
    await call("present_choices", { ...choices(), message: "The agent's own summary" });
    idle();
  });
  await f.run("@hive  Something hands-on, please");
  assert.equal(seen[0].userMessage, "Something hands-on, please");
  assert.equal(seen[0].message, "The agent's own summary");
});

test("live choices reject source pages the agent did not read, and make no panel", async (t) => {
  const adapter: JevAdapter = {
    decide: async () => ({ control: "comparison", scores: { a: 1 } }),
  };
  const f = await shimFixture(t, {
    jevMode: "live",
    jevAdapter: adapter,
    browse: () => ({ status: 502, data: { error: { message: "Read failed" } } }),
  });
  f.whenPrompted(async ({ call, idle }) => {
    await call("present_choices", {
      ...choices(),
      control: "comparison",
      options: [
        {
          id: "a",
          label: "A",
          details: [],
          sources: [{ title: "Source", url: "https://example.org/a" }],
        },
      ],
    });
    idle();
  });
  const chat = await f.run("@hive Compare exhibits");
  const result = jevToolResultSchema.parse(chat.tools[0].result);
  assert.equal(result.panel, null);
  assert.match(result.error ?? "", /Read the source page/);
  assert.deepEqual(await f.db.list("local-user", "jev_panels"), []);
});
