import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dockerfile = readFileSync(new URL("../apps/workspace/Dockerfile", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the image carries the OpenCode the server's SDK is pinned to", () => {
  // The server only checks the major version at boot; the wire protocol is checked against this one.
  const version = /^ARG OPENCODE_VERSION=(\S+)$/m.exec(dockerfile)?.[1];
  assert.equal(version, manifest.dependencies["@opencode-ai/sdk"]);
});

test("the image installs packages with the pnpm the repository is pinned to", () => {
  const pnpm = String(manifest.packageManager).split("@")[1];
  assert.ok(pnpm);
  assert.ok(dockerfile.includes(`pnpm@${pnpm}`), "the Dockerfile installs a different pnpm");
});

test("the image runs the workspace supervisor, behind an init that reaps what the agent leaves", () => {
  assert.match(dockerfile, /^ENTRYPOINT \["tini", "-s", "--"\]$/m);
  assert.match(dockerfile, /^CMD \["node", "dist\/apps\/workspace\/src\/index\.js"\]$/m);
});
