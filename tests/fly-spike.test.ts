import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { FlyProvisioner } from "../apps/control/src/fly.ts";
import { runSpike, type WorkspaceProbe } from "../apps/control/tools/fly-spike.ts";
import { fakeFly } from "./helpers/fake-fly.ts";

let fly: Awaited<ReturnType<typeof fakeFly>>;
beforeEach(async () => {
  fly = await fakeFly();
});
afterEach(async () => {
  await fly.close();
});

const provisioner = () =>
  new FlyProvisioner({
    token: fly.token,
    org: "hive-test",
    image: "registry.example.test/hive-workspace:1",
    region: "iad",
    appPrefix: "hive",
    workspaceEnv: {},
    apiUrl: fly.apiUrl,
    publicUrlTemplate: fly.publicUrlTemplate,
    waitSeconds: 5,
    pollMs: 20,
    retryMs: 5,
  });
/** A workspace that remembers what it was given, as one with a volume does. */
function probe(keeps = true): WorkspaceProbe & { calls: string[] } {
  let kept = false;
  const calls: string[] = [];
  return {
    calls,
    async write() {
      calls.push("write");
      kept = true;
    },
    async read() {
      calls.push("read");
      return keeps && kept;
    },
  };
}

test("the spike makes a workspace, stops and wakes it, finds its data, and leaves nothing behind", async () => {
  const lines: string[] = [];
  const p = probe();
  const report = await runSpike({
    provisioner: provisioner(),
    probe: p,
    log: (line) => lines.push(line),
  });
  assert.equal(report.ok, true, JSON.stringify(report.steps.filter((s) => !s.ok)));
  assert.deepEqual(
    report.steps.map((step) => step.name.split(":")[0]),
    [
      "create",
      "create again",
      "state after create",
      "sign in and keep a channel",
      "stop the machine",
      "state after stop",
      "the address wakes it by itself (autostart)",
      "stop it again",
      "wake it, as the control plane does, and wait for its first answer",
      "what was kept is still there after the stop and start",
      "destroy",
      "nothing is left",
    ],
  );
  assert.deepEqual(p.calls, ["write", "read"]);
  assert.equal(report.steps.find((s) => s.name === "state after create")?.note, "running");
  assert.equal(report.steps.find((s) => s.name === "state after stop")?.note, "stopped");
  assert.equal(fly.apps.size, 0);
  assert.ok(lines.length >= report.steps.length);
});

test("data that did not survive the stop is a failure, and the workspace is still removed", async () => {
  const report = await runSpike({ provisioner: provisioner(), probe: probe(false) });
  assert.equal(report.ok, false);
  const failed = report.steps.filter((step) => !step.ok);
  assert.equal(failed.length, 1);
  assert.match(failed[0]?.note ?? "", /channel was not there/);
  assert.equal(fly.apps.size, 0);
});

test("a workspace that cannot be made is reported, and what was made of it is removed", async () => {
  fly.failNext(/POST \/v1\/apps\/hive-[\w-]+\/machines$/, 400, 1);
  const report = await runSpike({ provisioner: provisioner(), probe: probe() });
  assert.equal(report.ok, false);
  assert.equal(report.steps[0]?.ok, false);
  assert.equal(fly.apps.size, 0);
});

test("with keep, the workspace is left running to be looked at", async () => {
  const report = await runSpike({ provisioner: provisioner(), probe: probe(), keep: true });
  assert.equal(report.ok, true);
  assert.equal(fly.apps.size, 1);
  assert.equal(fly.machineOf([...fly.apps.keys()][0] ?? "")?.state, "started");
});
