import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";

/** A server that answers like `opencode serve`: a health check, and a global event stream that stays open. */
async function opencodeServer(t: TestContext, version: string) {
  const server: Server = createServer((request, response) => {
    if (request.url === "/global/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ healthy: true, version }));
    } else if (request.url === "/global/event") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": connected\n\n");
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${address.port}`;
}

async function app(t: TestContext, opencodeServerUrl: string) {
  const dataDir = await mkdtemp(join(tmpdir(), "hive-opencode-boot-"));
  const db = await createStore();
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir,
    agentBackend: "opencode",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
    opencodeServerUrl,
  };
  const server = await createApp(db, config);
  t.after(async () => {
    await server.opencode.stop();
    await server.agent.stop();
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return server;
}

test("building the app reaches no server, so tests can stand in for OpenCode", async (t) => {
  // Nothing listens on port 1: creating the app must not need it.
  const server = await app(t, "http://127.0.0.1:1");
  assert.ok(server.agent.opencodeRuntime);
});

test("starting fails loudly when OpenCode cannot be reached", async (t) => {
  const server = await app(t, "http://127.0.0.1:1");
  await assert.rejects(
    server.opencode.start(),
    /OpenCode server unreachable at http:\/\/127\.0\.0\.1:1/,
  );
});

test("starting fails loudly when OpenCode is a different major version", async (t) => {
  const server = await app(t, await opencodeServer(t, "2.0.0"));
  await assert.rejects(server.opencode.start(), /Incompatible OpenCode server version "2\.0\.0"/);
});

test("starting checks the server and opens its event stream", async (t) => {
  const server = await app(t, await opencodeServer(t, "1.18.0"));
  await server.opencode.start();
  const runtime = server.agent.opencodeRuntime;
  assert.ok(runtime);
  await Promise.race([
    runtime.bus.waitForConnection(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("The event stream never connected")), 5000),
    ),
  ]);
});
