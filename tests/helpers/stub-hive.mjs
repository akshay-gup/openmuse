// Stands in for the workspace server when a test runs the workspace supervisor: like the real one,
// it asks the agent for its health as soon as it starts, and writes down what happens to it.
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { MARKERS, OPENCODE_SERVER_URL, OPENCODE_SERVER_PASSWORD } = process.env;
const mark = (event) => appendFileSync(MARKERS, `hive ${event} ${Date.now()}\n`);
writeFileSync(join(MARKERS, "..", "hive-env.json"), JSON.stringify(process.env));

const auth = `Basic ${Buffer.from(`opencode:${OPENCODE_SERVER_PASSWORD}`).toString("base64")}`;
const agentThere = await fetch(`${OPENCODE_SERVER_URL}/global/health`, {
  headers: { Authorization: auth },
})
  .then((response) => response.ok)
  .catch(() => false);
mark(agentThere ? "started-with-agent" : "started-without-agent");

if (process.env.STUB_CRASH_AFTER_MS)
  setTimeout(() => process.exit(4), Number(process.env.STUB_CRASH_AFTER_MS));
process.on("SIGTERM", () => {
  mark("terminated");
  if (!process.env.STUB_IGNORE_TERM) process.exit(0);
});
setInterval(() => {}, 1000);
