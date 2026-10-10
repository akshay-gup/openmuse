/**
 * Builds the workspace image and runs it the way a machine does, to check what no stand-in can:
 * that it starts, signs a person in with a control plane's token, runs as nobody in particular,
 * keeps its secrets and its data across a restart, and stops when asked.
 *
 *   pnpm exec tsx apps/workspace/tests/run-docker.ts
 *
 * HIVE_IMAGE            use this image instead of building one
 * DOCKER_BUILD_ARGS     extra arguments for `docker build`, split on spaces
 * DOCKER_NETWORK=host   run on the host's network, where the bridge is not available
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import {
  generateWorkspaceKeys,
  signWorkspaceToken,
} from "../../../packages/integrations/src/workspace-token.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const name = `hive-workspace-test-${randomUUID().slice(0, 8)}`;
const volume = `${name}-data`;
const workspaceId = "w4k9t2mx7a";
const keys = generateWorkspaceKeys();

const docker = (args: string[], input?: string) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });

let image = process.env.HIVE_IMAGE;
if (!image) {
  image = "hive-workspace:test";
  const extra = (process.env.DOCKER_BUILD_ARGS ?? "").split(/\s+/).filter(Boolean);
  console.log(`Building ${image}`);
  execFileSync("docker", ["build", ...extra, "-f", "apps/workspace/Dockerfile", "-t", image, "."], {
    cwd: root,
    stdio: "inherit",
  });
}

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const token = (over: { workspace?: string } = {}) =>
  signWorkspaceToken(keys.privateKey, {
    workspaceId: over.workspace ?? workspaceId,
    sub: "acct_ada",
    email: "ada@example.com",
    name: "Ada",
    role: "owner",
  });
const signIn = (value: string) =>
  fetch(`${url}/api/auth/managed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: value }),
  });
async function untilHealthy(seconds = 120) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const health = await fetch(`${url}/api/health`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (health) return health as { ok: boolean; managed: boolean; workspace: string };
    await sleep(500);
  }
  throw new Error(`The workspace did not answer in ${seconds}s`);
}
const inside = (script: string, user = "root") =>
  docker(["exec", "--user", user, name, "sh", "-c", script]);
/**
 * The environment of the process whose command line starts with `command`. Read as the workspace's
 * own user: not even root may read another user's processes in a container without extra rights.
 */
const environmentOf = (command: string) =>
  inside(
    `for p in /proc/[0-9]*; do if tr '\\0' ' ' < $p/cmdline 2>/dev/null | grep -q '^${command}'; then tr '\\0' '\\n' < $p/environ 2>/dev/null; fi; done`,
    "10001",
  ).split("\n");

try {
  docker(["volume", "create", volume]);
  docker([
    "run",
    "--detach",
    "--name",
    name,
    ...(process.env.DOCKER_NETWORK === "host"
      ? ["--network", "host"]
      : ["--publish", `127.0.0.1:${port}:${port}`]),
    "--volume",
    `${volume}:/data`,
    // What the control plane gives a machine, and nothing else.
    ...Object.entries({
      WORKSPACE_MODE: "live",
      WORKSPACE_ID: workspaceId,
      CONTROL_PLANE_PUBLIC_KEY: keys.publicKey,
      PUBLIC_API_URL: url,
      ALLOWED_ORIGINS: "https://hive.example.test",
      PORT: String(port),
      MODEL: "anthropic/test-model",
      ANTHROPIC_API_KEY: "provider-key-for-the-agent",
    }).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    image,
  ]);

  const started = Date.now();
  const health = await untilHealthy();
  console.log(`Answered after ${((Date.now() - started) / 1000).toFixed(1)}s`);
  assert.deepEqual(
    { ok: health.ok, managed: health.managed, workspace: health.workspace },
    { ok: true, managed: true, workspace: workspaceId },
  );

  // It signs in the people a control plane vouches for, each token once, and only for this workspace.
  const first = await signIn(token());
  assert.equal(first.status, 200);
  const { token: session, user } = (await first.json()) as { token: string; user: { id: string } };
  assert.equal(user.id, "acct:acct_ada");
  const asAda = { Authorization: `Bearer ${session}`, "Content-Type": "application/json" };
  assert.equal((await signIn(token({ workspace: "w2xyz" }))).status, 401);

  // Nothing here runs as root, apart from the init that reaps what the agent leaves behind.
  const processes = docker(["top", name, "-eo", "pid,user,args"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .map(([, user, ...command]) => ({ user, command: command.join(" ") }));
  for (const { user, command } of processes)
    if (!/\btini\b/.test(command)) assert.notEqual(user, "root", command);
  assert.ok(processes.some(({ command }) => /opencode serve/.test(command)));
  assert.ok(processes.some(({ command }) => /apps\/server\/src\/index\.js/.test(command)));

  // The machine's settings hold no secret of the workspace's own: it made them itself, on the volume.
  const settings = docker(["inspect", name, "--format", "{{json .Config.Env}}"]);
  assert.doesNotMatch(settings, /TOKEN_ENCRYPTION_KEY|OPENCODE_SERVER_PASSWORD/);
  const secrets = inside("stat -c '%a %U' /data/secrets.json && sha256sum /data/secrets.json");
  assert.match(secrets, /^600 hive/);

  // The agent has its model's key and a place to keep its sessions, and not the server's secrets.
  const agent = environmentOf("opencode serve");
  assert.ok(agent.includes("ANTHROPIC_API_KEY=provider-key-for-the-agent"));
  assert.ok(agent.includes("OPENCODE_DISABLE_AUTOUPDATE=true"));
  assert.ok(agent.includes("XDG_DATA_HOME=/data/opencode/data"));
  assert.ok(!agent.some((line) => line.startsWith("TOKEN_ENCRYPTION_KEY=")));

  // Something to find again after a restart.
  const made = await fetch(`${url}/api/agent/channels`, {
    method: "POST",
    headers: asAda,
    body: JSON.stringify({ name: "kept-across-restarts" }),
  });
  assert.equal(made.status, 201);

  // It stops when asked, quickly and cleanly, server first.
  const stopping = Date.now();
  docker(["stop", "--time", "30", name]);
  const exit = docker(["inspect", name, "--format", "{{.State.ExitCode}}"]);
  console.log(`Stopped after ${((Date.now() - stopping) / 1000).toFixed(1)}s`);
  assert.equal(exit, "0");
  const log = docker(["logs", name]);
  assert.ok(log.indexOf("hive exited") < log.indexOf("opencode exited"), log);

  // And comes back with its secrets and its data.
  docker(["start", name]);
  await untilHealthy();
  assert.equal(inside("sha256sum /data/secrets.json"), secrets.split("\n")[1]);
  const again = await signIn(token());
  assert.equal(again.status, 200);
  const next = ((await again.json()) as { token: string }).token;
  const channels = (await (
    await fetch(`${url}/api/agent/channels`, { headers: { Authorization: `Bearer ${next}` } })
  ).json()) as { name: string }[];
  assert.ok(
    channels.some((channel) => channel.name === "kept-across-restarts"),
    JSON.stringify(channels),
  );
  console.log("The workspace image is sound");
} catch (error) {
  try {
    console.error(docker(["logs", name]).split("\n").slice(-40).join("\n"));
  } catch {}
  throw error;
} finally {
  try {
    docker(["rm", "--force", name]);
    docker(["volume", "rm", "--force", volume]);
  } catch {}
}
