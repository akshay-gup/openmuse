// Stands in for `opencode serve` when a test runs the workspace supervisor: it answers the health
// check the way the real one does (Basic auth, /global/health) and writes down what happens to it.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const { MARKERS, STUB_PORT, OPENCODE_SERVER_PASSWORD } = process.env;
const mark = (event) => appendFileSync(MARKERS, `agent ${event} ${Date.now()}\n`);
writeFileSync(join(MARKERS, "..", "agent-env.json"), JSON.stringify(process.env));
mark("started");

if (process.env.STUB_EXIT) process.exit(Number(process.env.STUB_EXIT));
const delay = Number(process.env.STUB_DELAY_MS ?? 0);
const expected = `Basic ${Buffer.from(`opencode:${OPENCODE_SERVER_PASSWORD}`).toString("base64")}`;
setTimeout(() => {
  createServer((req, res) => {
    if (req.url !== "/global/health") return res.writeHead(404).end();
    if (req.headers.authorization !== expected) return res.writeHead(401).end();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ healthy: true, version: "1.18.33" }));
  }).listen(Number(STUB_PORT), "127.0.0.1", () => mark("ready"));
}, delay);

if (process.env.STUB_CRASH_AFTER_MS)
  setTimeout(() => process.exit(3), delay + Number(process.env.STUB_CRASH_AFTER_MS));
process.on("SIGTERM", () => {
  mark("terminated");
  if (!process.env.STUB_IGNORE_TERM) process.exit(0);
});
setInterval(() => {}, 1000);
