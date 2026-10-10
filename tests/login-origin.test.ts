import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";

let db: Store;
let directory: string;
let app: Awaited<ReturnType<typeof createApp>>["app"];

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "hive-login-origin-"));
  db = await createStore();
  ({ app } = await createApp(db, {
    mode: "live",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "https://hive.example.test",
    dataDir: directory,
    encryptionKey: randomBytes(32).toString("base64"),
    googleClientId: "client-id.apps.test",
    googleClientSecret: "client-secret",
    googleRedirectUri: "https://hive.example.test/api/google/callback",
    allowedOrigins: ["https://app.example.test"],
  }));
});
after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

const url = (origin?: string) =>
  app.request(`/api/auth/google/url${origin ? `?origin=${encodeURIComponent(origin)}` : ""}`);

test("only a page of this server's own can be handed a Google sign-in", async () => {
  // The page that opened the sign-in is told its result, so any other would collect people's login codes.
  for (const origin of ["https://evil.test", "http://hive.example.test", "null"])
    assert.equal((await url(origin)).status, 403, origin);

  for (const origin of ["https://hive.example.test", "https://app.example.test", undefined]) {
    const response = await url(origin);
    assert.equal(response.status, 200, String(origin));
    assert.match((await response.json()).url, /^https:\/\/accounts\.google\.com\//);
  }
});
