import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { LocalProvisioner, localConfigFromEnv } from "../apps/control/src/local.ts";
import { plans } from "../apps/control/src/plans.ts";
import { ProvisionError, type WorkspaceSpec } from "../apps/control/src/provisioner.ts";
import { generateWorkspaceKeys } from "../packages/integrations/src/workspace-token.ts";

const stub = fileURLToPath(new URL("./helpers/stub-workspace.mjs", import.meta.url));
const keys = generateWorkspaceKeys();
const spec = (over: Partial<WorkspaceSpec> = {}): WorkspaceSpec => ({
  workspaceId: "w4k9t2mx7a",
  name: "Acme",
  plan: plans.free,
  controlPublicKey: keys.publicKey,
  allowedOrigins: ["https://app.example.test"],
  ...over,
});

let dir: string;
const made: LocalProvisioner[] = [];
const provisioner = (env: Record<string, string> = {}, waitSeconds = 10) => {
  const one = new LocalProvisioner({
    dir,
    command: [process.execPath, stub],
    cwd: process.cwd(),
    env,
    host: "127.0.0.1",
    waitSeconds,
  });
  made.push(one);
  return one;
};
const dataOf = (id = "w4k9t2mx7a") => join(dir, id, "data");
const given = async (id?: string): Promise<Record<string, string>> =>
  JSON.parse(await readFile(join(dataOf(id), "env.json"), "utf8"));
const boots = async (id?: string) => Number(await readFile(join(dataOf(id), "boots"), "utf8"));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "hive-local-"));
});
afterEach(async () => {
  await Promise.all(made.splice(0).map((one) => one.close()));
  await rm(dir, { recursive: true, force: true });
});

test("a workspace is a server of its own, with its own port and files, and answers", async () => {
  const one = provisioner();
  const result = await one.create(spec());
  const env = await given();
  assert.equal(result.url, `http://127.0.0.1:${env.PORT}`);
  assert.equal(env.WORKSPACE_ID, "w4k9t2mx7a");
  assert.equal(env.WORKSPACE_MODE, "live");
  assert.equal(env.CONTROL_PLANE_PUBLIC_KEY, keys.publicKey);
  assert.equal(env.ALLOWED_ORIGINS, "https://app.example.test");
  assert.equal(env.PUBLIC_API_URL, result.url);
  assert.equal(env.DATA_DIR, dataOf());
  assert.equal(await one.state("w4k9t2mx7a"), "running");

  // A second workspace gets another port and another directory.
  const other = await one.create(spec({ workspaceId: "wq7m2x9d4h" }));
  assert.notEqual(other.url, result.url);
  assert.equal((await given("wq7m2x9d4h")).WORKSPACE_ID, "wq7m2x9d4h");
});

test("a workspace server gets none of the control plane's secrets", async () => {
  const secrets = {
    CONTROL_SIGNING_KEY: "signing-secret",
    GOOGLE_CLIENT_SECRET: "google-secret",
    FLY_API_TOKEN: "fly-secret",
    DATABASE_URL: "postgres://control",
  };
  const before = Object.fromEntries(Object.keys(secrets).map((k) => [k, process.env[k]]));
  Object.assign(process.env, secrets);
  try {
    await provisioner({ MODEL: "anthropic/test-model" }).create(spec());
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const env = await given();
  for (const name of Object.keys(secrets)) assert.equal(env[name], undefined, name);
  assert.equal(env.PATH, process.env.PATH);
  assert.equal(env.MODEL, "anthropic/test-model");
  // It does make its own key for what it stores, apart from every other workspace's.
  assert.ok((env.TOKEN_ENCRYPTION_KEY ?? "").length >= 40);
});

test("what the workspace sets for itself cannot be overridden by the settings given to every one", async () => {
  await provisioner({ WORKSPACE_ID: "wsomeoneelse", PORT: "1", WORKSPACE_MODE: "demo" }).create(
    spec(),
  );
  const env = await given();
  assert.equal(env.WORKSPACE_ID, "w4k9t2mx7a");
  assert.equal(env.WORKSPACE_MODE, "live");
  assert.notEqual(env.PORT, "1");
});

test("creating a workspace again finds it running instead of starting another", async () => {
  const one = provisioner();
  const first = await one.create(spec());
  const second = await one.create(spec());
  assert.equal(second.url, first.url);
  assert.equal(await boots(), 1);
});

test("stopping keeps the files, and waking starts it again on the same address with them", async () => {
  const one = provisioner();
  const { url } = await one.create(spec());
  await one.stop("w4k9t2mx7a");
  assert.equal(await one.state("w4k9t2mx7a"), "stopped");
  assert.ok(existsSync(dataOf()));

  await one.wake("w4k9t2mx7a");
  assert.equal(await one.state("w4k9t2mx7a"), "running");
  assert.equal(`http://127.0.0.1:${(await given()).PORT}`, url);
  assert.equal(await boots(), 2);
});

test("callers that wake a workspace together share one start", async () => {
  const one = provisioner();
  await one.create(spec());
  await one.stop("w4k9t2mx7a");
  await Promise.all([one.wake("w4k9t2mx7a"), one.wake("w4k9t2mx7a"), one.wake("w4k9t2mx7a")]);
  assert.equal(await boots(), 2);
});

test("destroying stops the server and removes its files, and doing it again is fine", async () => {
  const one = provisioner();
  await one.create(spec());
  await one.destroy("w4k9t2mx7a");
  assert.equal(await one.state("w4k9t2mx7a"), "missing");
  assert.ok(!existsSync(join(dir, "w4k9t2mx7a")));
  await one.destroy("w4k9t2mx7a");
  await assert.rejects(one.wake("w4k9t2mx7a"), ProvisionError);
});

test("a server that stops while starting is reported with where to look", async () => {
  const one = provisioner({ STUB_EXIT: "1" });
  await assert.rejects(one.create(spec()), (error: unknown) => {
    assert.ok(error instanceof ProvisionError);
    assert.match(error.message, /server\.log/);
    // What the person sees says nothing of paths.
    assert.doesNotMatch(error.userMessage, /server\.log|\//);
    return true;
  });
  assert.equal(await one.state("w4k9t2mx7a"), "stopped");
});

test("a server that never answers is given up on, with a message for the person", async () => {
  const one = provisioner({ STUB_SILENT: "1" }, 1);
  await assert.rejects(one.create(spec()), (error: unknown) => {
    assert.ok(error instanceof ProvisionError);
    assert.match(error.message, /did not answer in 1s/);
    assert.match(error.userMessage, /try again/i);
    return true;
  });
  assert.equal(await one.state("w4k9t2mx7a"), "starting");
});

test("a control plane that was killed leaves workspaces a new one can find, wake and stop", async () => {
  const first = provisioner();
  const { url } = await first.create(spec());
  // `first` is never closed, as if its process had been killed outright.
  const next = provisioner();
  assert.equal(await next.state("w4k9t2mx7a"), "running");
  assert.equal((await next.create(spec())).url, url);
  assert.equal(await boots(), 1);

  await next.stop("w4k9t2mx7a");
  assert.equal(await next.state("w4k9t2mx7a"), "stopped");
  await next.wake("w4k9t2mx7a");
  assert.equal(await boots(), 2);
});

test("closing the provisioner stops every server it started", async () => {
  const one = provisioner();
  await one.create(spec());
  await one.create(spec({ workspaceId: "wq7m2x9d4h" }));
  await one.close();
  assert.equal(await one.state("w4k9t2mx7a"), "stopped");
  assert.equal(await one.state("wq7m2x9d4h"), "stopped");
});

test("the settings come from the environment, with the command and folder a laptop needs", () => {
  const config = localConfigFromEnv({
    LOCAL_DIR: "/srv/hive",
    LOCAL_COMMAND: "node --import tsx apps/server/src/index.ts",
    LOCAL_CWD: "/code/hive",
    LOCAL_WORKSPACE_ENV: JSON.stringify({ OPENCODE_SERVER_URL: "http://127.0.0.1:4096" }),
    LOCAL_WAIT_SECONDS: "5",
  });
  assert.equal(config.dir, "/srv/hive");
  assert.deepEqual(config.command, ["node", "--import", "tsx", "apps/server/src/index.ts"]);
  assert.equal(config.cwd, "/code/hive");
  assert.deepEqual(config.env, { OPENCODE_SERVER_URL: "http://127.0.0.1:4096" });
  assert.equal(config.waitSeconds, 5);

  const defaults = localConfigFromEnv({});
  assert.equal(defaults.dir, ".hive-control/workspaces");
  assert.equal(defaults.command[0], process.execPath);
  assert.throws(() => localConfigFromEnv({ LOCAL_WORKSPACE_ENV: "[1" }), /JSON object/);
});
