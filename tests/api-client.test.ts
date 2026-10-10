import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { ApiError, MuseApi } from "../apps/mobile/src/api-client.ts";

let server: Server;
let base: string;
/** The sessions the stand-in workspace honours, and how many requests it has turned away. */
const good = new Set<string>();
let turnedAway = 0;
const bodies: string[] = [];

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      res.setHeader("Content-Type", "application/json");
      if (!good.has(token)) {
        turnedAway++;
        res.writeHead(401).end(JSON.stringify({ error: "Session expired. Sign in again." }));
        return;
      }
      bodies.push(body.length > 200 ? `${body.length} bytes` : body);
      res.writeHead(200).end(JSON.stringify({ ok: true, path: req.url, method: req.method }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const fresh = () => {
  good.clear();
  turnedAway = 0;
  bodies.length = 0;
};

test("a request carries the session, and the base the api was made with", async () => {
  fresh();
  good.add("t1");
  const api = new MuseApi("t1", base);
  assert.deepEqual(await api.request("/api/thing", { a: 1 }), {
    ok: true,
    path: "/api/thing",
    method: "POST",
  });
  assert.equal((await api.request<{ method: string }>("/api/thing")).method, "GET");
  assert.equal(api.url("/api/files/x"), `${base}/api/files/x`);
  assert.equal(api.url("https://elsewhere.test/x"), "https://elsewhere.test/x");
});

test("a session the workspace refuses is renewed once, and the request made again with the new one", async () => {
  fresh();
  const api = new MuseApi("old", base);
  let renewals = 0;
  api.renew = async () => {
    renewals++;
    good.add("new");
    return "new";
  };
  const result = await api.request<{ ok: boolean }>("/api/thing", { a: 1 });
  assert.equal(result.ok, true);
  assert.equal(renewals, 1);
  assert.equal(api.token, "new");
  assert.deepEqual(bodies, ['{"a":1}']);
  // Later requests just use it.
  await api.request("/api/other");
  assert.equal(renewals, 1);
});

test("requests refused together share one renewal", async () => {
  fresh();
  const api = new MuseApi("old", base);
  let renewals = 0;
  api.renew = async () => {
    renewals++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    good.add("new");
    return "new";
  };
  const results = await Promise.all([
    api.request<{ path: string }>("/api/a"),
    api.request<{ path: string }>("/api/b"),
    api.request<{ path: string }>("/api/c"),
  ]);
  assert.deepEqual(results.map((r) => r.path).sort(), ["/api/a", "/api/b", "/api/c"]);
  assert.equal(renewals, 1);
});

test("without a way to renew, a refused session is an error with its status", async () => {
  fresh();
  const api = new MuseApi("old", base);
  await assert.rejects(api.request("/api/thing"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.match(error.message, /Session expired/);
    return true;
  });
  assert.equal(turnedAway, 1);
});

test("a renewal that gives nothing, fails, or does not help ends in the refusal, and is not tried in a loop", async () => {
  fresh();
  const none = new MuseApi("old", base);
  none.renew = async () => null;
  await assert.rejects(none.request("/api/thing"), (e: unknown) => (e as ApiError).status === 401);
  assert.equal(turnedAway, 1);

  fresh();
  const broken = new MuseApi("old", base);
  broken.renew = async () => {
    throw new Error("the control plane could not be reached");
  };
  await assert.rejects(
    broken.request("/api/thing"),
    (e: unknown) => (e as ApiError).status === 401,
  );

  fresh();
  const useless = new MuseApi("old", base);
  let asked = 0;
  useless.renew = async () => {
    asked++;
    return "also-refused";
  };
  await assert.rejects(
    useless.request("/api/thing"),
    (e: unknown) => (e as ApiError).status === 401,
  );
  assert.equal(asked, 1);
  assert.equal(turnedAway, 2);
});

test("a file upload is made again whole when its session is renewed", async () => {
  fresh();
  const api = new MuseApi("old", base);
  api.renew = async () => {
    good.add("new");
    return "new";
  };
  const form = new FormData();
  form.append("file", new File(["x".repeat(500)], "big.txt", { type: "text/plain" }), "big.txt");
  await api.request("/api/files", form);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0] ?? "", /bytes$/);
  assert.ok(Number.parseInt(bodies[0] ?? "0", 10) > 500);
});
