import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { type FlyConfig, FlyProvisioner, flyConfigFromEnv } from "../apps/control/src/fly.ts";
import { plans } from "../apps/control/src/plans.ts";
import { ProvisionError, type WorkspaceSpec } from "../apps/control/src/provisioner.ts";
import { generateWorkspaceKeys } from "../packages/integrations/src/workspace-token.ts";
import { fakeFly } from "./helpers/fake-fly.ts";

let fly: Awaited<ReturnType<typeof fakeFly>>;
const keys = generateWorkspaceKeys();

const spec = (over: Partial<WorkspaceSpec> = {}): WorkspaceSpec => ({
  workspaceId: "w4k9t2mx7a",
  name: "Acme",
  plan: plans.free,
  controlPublicKey: keys.publicKey,
  allowedOrigins: ["https://app.example.test"],
  ...over,
});
const provisioner = (over: Partial<FlyConfig> = {}) =>
  new FlyProvisioner({
    token: fly.token,
    org: "hive-test",
    image: "registry.example.test/hive-workspace:1",
    region: "iad",
    appPrefix: "hive",
    workspaceEnv: { MODEL: "anthropic/test-model" },
    apiUrl: fly.apiUrl,
    graphqlUrl: fly.graphqlUrl,
    publicUrlTemplate: fly.publicUrlTemplate,
    waitSeconds: 5,
    pollMs: 20,
    retryMs: 5,
    ...over,
  });
const flyCalls = (method: string, path: RegExp) =>
  fly.calls.filter((c) => c.method === method && path.test(c.path));

beforeEach(async () => {
  fly = await fakeFly();
});
afterEach(async () => {
  await fly.close();
});

test("a workspace gets an app of its own, an address, a volume and a machine, and answers", async () => {
  const result = await provisioner().create(spec());
  assert.equal(result.url, `${fly.publicUrlTemplate.replace("{app}", "hive-w4k9t2mx7a")}`);

  const app = fly.apps.get("hive-w4k9t2mx7a");
  assert.ok(app);
  assert.equal(app.org, "hive-test");
  // Its own private network, named for it, so no other workspace's machine can reach this one.
  assert.equal(app.network, "hive-w4k9t2mx7a");
  assert.deepEqual([...app.ips].sort(), ["shared_v4", "v6"]);

  const [volume] = [...app.volumes.values()];
  assert.equal(volume?.name, "data");
  assert.equal(volume?.size_gb, plans.free.volumeGb);
  assert.equal(volume?.region, "iad");
  assert.equal(volume?.encrypted, true);
  assert.equal(volume?.snapshot_retention, 60);

  const [machine] = [...app.machines.values()];
  assert.ok(machine);
  assert.equal(machine.config.image, "registry.example.test/hive-workspace:1");
  assert.deepEqual(machine.config.guest, { cpu_kind: "shared", cpus: 2, memory_mb: 4096 });
  assert.deepEqual(machine.config.mounts, [{ volume: volume?.id, path: "/data" }]);
  assert.equal(machine.state, "started");
});

test("the machine is told which workspace it is and who may vouch for people, and nothing secret", async () => {
  await provisioner().create(spec());
  const machine = fly.machineOf("hive-w4k9t2mx7a");
  const env = machine?.config.env ?? {};
  assert.equal(env.WORKSPACE_MODE, "live");
  assert.equal(env.WORKSPACE_ID, "w4k9t2mx7a");
  assert.equal(env.CONTROL_PLANE_PUBLIC_KEY, keys.publicKey);
  assert.equal(env.ALLOWED_ORIGINS, "https://app.example.test");
  assert.equal(env.PUBLIC_API_URL, fly.publicUrlTemplate.replace("{app}", "hive-w4k9t2mx7a"));
  assert.equal(env.HOST, "0.0.0.0");
  assert.equal(env.PORT, "8787");
  assert.equal(env.DATA_DIR, "/data/hive");
  // Whatever the deployment gives every workspace is passed on.
  assert.equal(env.MODEL, "anthropic/test-model");
  // The workspace makes its own keys on its volume; none are sent from here.
  for (const name of ["TOKEN_ENCRYPTION_KEY", "OPENCODE_SERVER_PASSWORD", "WORKER_TOKEN"])
    assert.equal(name in env, false, name);
  // Nor does the request carry Hive's own signing key or Fly token anywhere in its body.
  for (const call of fly.calls)
    assert.equal(JSON.stringify(call.body ?? "").includes(fly.token), false);
});

test("the free plan stops an idle machine and the team plan keeps it running", async () => {
  await provisioner().create(spec());
  await provisioner().create(spec({ workspaceId: "wteam00001", plan: plans.team }));
  const free = fly.machineOf("hive-w4k9t2mx7a")?.config.services?.[0];
  const team = fly.machineOf("hive-wteam00001")?.config.services?.[0];
  assert.equal(free?.autostop, "stop");
  assert.equal(free?.autostart, true);
  assert.equal(team?.autostop, "off");
  assert.equal(team?.autostart, true);
  assert.equal(free?.internal_port, 8787);
  assert.deepEqual(free?.ports, [
    { port: 443, handlers: ["tls", "http"] },
    { port: 80, handlers: ["http"], force_https: true },
  ]);
  const volumes = [...(fly.apps.get("hive-wteam00001")?.volumes.values() ?? [])];
  assert.equal(volumes[0]?.size_gb, plans.team.volumeGb);
});

test("creating a workspace that exists finishes it rather than making a second", async () => {
  const p = provisioner();
  await p.create(spec());
  const before = fly.calls.length;
  const again = await p.create(spec());
  assert.match(again.url, /hive-w4k9t2mx7a/);
  assert.equal(fly.apps.size, 1);
  const app = fly.apps.get("hive-w4k9t2mx7a");
  assert.equal(app?.volumes.size, 1);
  assert.equal(app?.machines.size, 1);
  // The second pass only looked: it made nothing.
  const made = fly.calls
    .slice(before)
    .filter((c) => c.method === "POST" && !c.path.startsWith("/graphql"));
  assert.deepEqual(made, []);
});

test("a creation that stopped half way is picked up where it was", async () => {
  // The app and its volume exist, but no machine: the control plane restarted mid-way.
  const early = provisioner();
  fly.failNext(/POST \/v1\/apps\/hive-w4k9t2mx7a\/machines$/, 400, 1);
  await assert.rejects(early.create(spec()), /answered 400/);
  const app = fly.apps.get("hive-w4k9t2mx7a");
  assert.equal(app?.volumes.size, 1);
  assert.equal(app?.machines.size, 0);
  await provisioner().create(spec());
  assert.equal(app?.volumes.size, 1);
  assert.equal(app?.machines.size, 1);
});

test("a machine that takes a while to start is waited for", async () => {
  await fly.close();
  fly = await fakeFly({ startDelayMs: 150 });
  const started = Date.now();
  await provisioner().create(spec());
  assert.ok(Date.now() - started >= 100);
  assert.equal(fly.machineOf("hive-w4k9t2mx7a")?.state, "started");
});

test("one that never answers fails with a message for the person, and the cause for the log", async () => {
  await fly.close();
  fly = await fakeFly({ startDelayMs: 60_000 });
  const p = provisioner({ waitSeconds: 1 });
  await assert.rejects(p.create(spec()), (error: unknown) => {
    assert.ok(error instanceof ProvisionError);
    assert.match(error.message, /did not reach started/);
    assert.match(error.userMessage, /Try again/);
    assert.equal(error.userMessage.includes("fly.dev"), false);
    return true;
  });
});

test("a workspace that answers as a different one is refused", async () => {
  const p = provisioner({ waitSeconds: 1 });
  // Hand the machine another workspace's id by creating it under a different spec id.
  await p.create(spec());
  const machine = fly.machineOf("hive-w4k9t2mx7a");
  assert.ok(machine?.config.env);
  machine.config.env.WORKSPACE_ID = "wsomeoneels";
  await assert.rejects(p.create(spec()), /different workspace/);
});

test("Fly being busy or having a bad moment is tried again", async () => {
  fly.failNext(/POST \/v1\/apps$/, 429, 2);
  fly.failNext(/GET \/v1\/apps\/hive-w4k9t2mx7a\/volumes$/, 503, 1);
  await provisioner().create(spec());
  assert.equal(fly.apps.size, 1);
  // A request that is refused for good is not tried again.
  fly.failNext(/POST \/v1\/apps$/, 403, 5);
  await assert.rejects(provisioner().create(spec({ workspaceId: "wother0001" })), /answered 403/);
  assert.equal(flyCalls("POST", /^\/v1\/apps$/).length, 4);
});

test("the error from Fly names the call and its answer but never the token", async () => {
  await fly.close();
  fly = await fakeFly({ token: "right-token" });
  const wrong = provisioner({ token: "wrong-token-secret-value" });
  await assert.rejects(wrong.create(spec()), (error: unknown) => {
    assert.ok(error instanceof ProvisionError);
    assert.match(error.message, /401/);
    assert.equal(error.message.includes("wrong-token-secret-value"), false);
    assert.equal(error.userMessage.includes("401"), false);
    return true;
  });
});

test("waking starts a stopped machine and waits for the workspace to answer", async () => {
  const p = provisioner();
  await p.create(spec());
  assert.equal(await p.state("w4k9t2mx7a"), "running");
  await fetch(
    `${fly.apiUrl}/apps/hive-w4k9t2mx7a/machines/${fly.machineOf("hive-w4k9t2mx7a")?.id}/stop`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${fly.token}` },
    },
  );
  assert.equal(await p.state("w4k9t2mx7a"), "stopped");
  await p.wake("w4k9t2mx7a");
  assert.equal(await p.state("w4k9t2mx7a"), "running");
  const starts = flyCalls("POST", /\/machines\/m\d+\/start$/);
  // Once by the test's own stop and start above... only the provisioner's start counts.
  assert.equal(starts.length, 1);
  // A machine that is already running is left alone.
  await p.wake("w4k9t2mx7a");
  assert.equal(flyCalls("POST", /\/machines\/m\d+\/start$/).length, 1);
});

test("waking a workspace with no machine says so", async () => {
  await assert.rejects(provisioner().wake("wnothere001"), (error: unknown) => {
    assert.ok(error instanceof ProvisionError);
    return true;
  });
  assert.equal(await provisioner().state("wnothere001"), "missing");
});

test("destroying removes the machine, the volume and the app, and can be done again", async () => {
  const p = provisioner();
  await p.create(spec());
  await p.destroy("w4k9t2mx7a");
  assert.equal(fly.apps.has("hive-w4k9t2mx7a"), false);
  // Gone is gone: asking again, or for something that never was, is not an error.
  await p.destroy("w4k9t2mx7a");
  await p.destroy("wnever00001");
  // Machines and volumes went before the app did.
  const order = fly.calls
    .filter((c) => c.method === "DELETE")
    .map((c) =>
      c.path.includes("/machines/") ? "machine" : c.path.includes("/volumes/") ? "volume" : "app",
    );
  assert.deepEqual(order.slice(0, 3), ["machine", "volume", "app"]);
});

test("app names are what Fly accepts", () => {
  const name = provisioner().appName("W4K9T2MX7A");
  assert.equal(name, "hive-w4k9t2mx7a");
  assert.match(name, /^[a-z0-9-]{1,30}$/);
});

test("the Fly settings come from the environment, and say what is missing", () => {
  const full = {
    FLY_API_TOKEN: "t",
    FLY_ORG: "o",
    FLY_IMAGE: "registry.example/hive:1",
  };
  assert.throws(() => flyConfigFromEnv({}), /FLY_API_TOKEN/);
  assert.throws(() => flyConfigFromEnv({ ...full, FLY_ORG: " " }), /FLY_ORG/);
  assert.throws(() => flyConfigFromEnv({ ...full, FLY_IMAGE: undefined }), /FLY_IMAGE/);
  const config = flyConfigFromEnv({ ...full, HIVE_WORKSPACE_ENV: '{"MODEL":"m","KEY":"k"}' });
  assert.equal(config.region, "iad");
  assert.equal(config.appPrefix, "hive");
  assert.equal(config.apiUrl, "https://api.machines.dev/v1");
  assert.equal(config.publicUrlTemplate, "https://{app}.fly.dev");
  assert.deepEqual(config.workspaceEnv, { MODEL: "m", KEY: "k" });
  assert.throws(
    () => flyConfigFromEnv({ ...full, HIVE_WORKSPACE_ENV: "[1]" }),
    /object of strings/,
  );
  assert.throws(() => flyConfigFromEnv({ ...full, HIVE_WORKSPACE_ENV: "{" }), /object of strings/);
});
