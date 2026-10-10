// Stands in for a workspace server when a test starts one through the local provisioner: it
// answers the health check as a real one would, and leaves what it was given for the test to read.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const { WORKSPACE_ID, HOST, PORT, DATA_DIR } = process.env;
mkdirSync(DATA_DIR, { recursive: true });

// Each start counts itself, so a test can tell a restart from a first run and see the files survive.
const boots = join(DATA_DIR, "boots");
writeFileSync(boots, String((existsSync(boots) ? Number(readFileSync(boots, "utf8")) : 0) + 1));
writeFileSync(join(DATA_DIR, "env.json"), JSON.stringify(process.env));

if (process.env.STUB_EXIT) process.exit(1);

createServer((req, res) => {
  if (req.url === "/api/health" && !process.env.STUB_SILENT) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, managed: true, workspace: WORKSPACE_ID }));
    return;
  }
  res.writeHead(503).end();
}).listen(Number(PORT), HOST);
process.on("SIGTERM", () => process.exit(0));
