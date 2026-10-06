import assert from "node:assert/strict";
import { test } from "node:test";
import { browserWorkerUrl, shadowedEnvKeys } from "../apps/server/src/config.ts";

// readConfig reads the environment, and importing config.ts has just filled it from a developer's own
// .env, which can still name a backend that no longer exists.
delete process.env.AGENT_BACKEND;

test("the Intelligence key is optional in every API mode", async () => {
  const { readConfig } = await import("../apps/server/src/config.ts");
  const old = process.env.CPK_INTELLIGENCE_API_KEY;
  try {
    for (const key of [undefined, "", " \t\n"]) {
      if (key === undefined) delete process.env.CPK_INTELLIGENCE_API_KEY;
      else process.env.CPK_INTELLIGENCE_API_KEY = key;
      process.env.WORKSPACE_MODE = "sample";
      assert.equal(readConfig().intelligenceApiKey, undefined);
    }
    process.env.CPK_INTELLIGENCE_API_KEY = "test-project-key-never-sent";
    assert.equal(readConfig().intelligenceApiKey, "test-project-key-never-sent");
  } finally {
    if (old === undefined) delete process.env.CPK_INTELLIGENCE_API_KEY;
    else process.env.CPK_INTELLIGENCE_API_KEY = old;
    delete process.env.WORKSPACE_MODE;
  }
});

test("the agent is OpenCode: AGENT_BACKEND may be left out or name it, and nothing else boots", async () => {
  const { readConfig } = await import("../apps/server/src/config.ts");
  const old = process.env.AGENT_BACKEND;
  try {
    for (const accepted of [undefined, "", "  ", "opencode"]) {
      if (accepted === undefined) delete process.env.AGENT_BACKEND;
      else process.env.AGENT_BACKEND = accepted;
      assert.doesNotThrow(() => readConfig(), `AGENT_BACKEND=${accepted}`);
    }
    for (const removed of ["sample", "model", "agui"]) {
      process.env.AGENT_BACKEND = removed;
      assert.throws(
        () => readConfig(),
        new RegExp(`AGENT_BACKEND=${removed} is no longer supported.*OpenCode`),
      );
    }
  } finally {
    if (old === undefined) delete process.env.AGENT_BACKEND;
    else process.env.AGENT_BACKEND = old;
  }
});

test("Jev mode is off by default and validates explicit modes", async () => {
  const { readConfig } = await import("../apps/server/src/config.ts");
  const old = {
    JEV_MODE: process.env.JEV_MODE,
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    CPK_INTELLIGENCE_API_KEY: process.env.CPK_INTELLIGENCE_API_KEY,
  };
  try {
    process.env.CPK_INTELLIGENCE_API_KEY = "test-project-key-never-sent";
    delete process.env.JEV_MODE;
    assert.equal(readConfig().jevMode, "off");
    process.env.JEV_MODE = "sample";
    assert.equal(readConfig().jevMode, "sample");
    process.env.JEV_MODE = "live";
    delete process.env.TYPESAFE_API_KEY;
    assert.throws(() => readConfig(), /TYPESAFE_API_KEY/);
    process.env.TYPESAFE_API_KEY = "fixture-key";
    assert.equal(readConfig().typesafeApiKey, "fixture-key");
    process.env.JEV_MODE = "invalid";
    assert.throws(() => readConfig(), /JEV_MODE/);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("browser worker URL keeps an existing scheme and adds http to host:port", () => {
  assert.equal(browserWorkerUrl(undefined), undefined);
  assert.equal(browserWorkerUrl("  "), undefined);
  assert.equal(browserWorkerUrl("http://127.0.0.1:8790"), "http://127.0.0.1:8790");
  assert.equal(browserWorkerUrl("https://browser.internal:8790"), "https://browser.internal:8790");
  assert.equal(browserWorkerUrl("hive-browser-h4fx:8790"), "http://hive-browser-h4fx:8790");
});

test("environment variables that override a different .env value are reported by name", () => {
  const file = { OPENAI_API_KEY: "sk-or-file", MODEL: "openai/gpt-5", PORT: "8787", EMPTY: "" };
  const env = { OPENAI_API_KEY: "sk-proj-system", MODEL: "openai/gpt-5", EMPTY: "set" };
  assert.deepEqual(shadowedEnvKeys(file, env), ["OPENAI_API_KEY", "EMPTY"]);
  assert.deepEqual(shadowedEnvKeys(file, {}), []);
});
