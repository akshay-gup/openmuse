import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  generateWorkspaceKeys,
  MAX_TOKEN_SECONDS,
  parseWorkspacePublicKey,
  signWorkspaceToken,
  verifyWorkspaceToken,
  WorkspaceTokenError,
} from "../packages/integrations/src/workspace-token.ts";

const keys = generateWorkspaceKeys();
const person = {
  workspaceId: "w1abc",
  sub: "acct_1",
  email: "ada@example.com",
  name: "Ada",
  role: "member" as const,
};
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A token with any claims at all, signed by `privateKey`, for the cases `signWorkspaceToken` refuses to make. */
function forge(privateKey: string, claims: Record<string, unknown>, alg = "EdDSA") {
  const body = `${part({ alg, typ: "JWT" })}.${part(claims)}`;
  const key = createPrivateKey({
    key: Buffer.from(privateKey, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  return `${body}.${sign(null, Buffer.from(body), key).toString("base64url")}`;
}
const claimsAt = (now: number, over: Record<string, unknown> = {}) => ({
  iss: "hive-control",
  aud: "ws:w1abc",
  sub: "acct_1",
  email: "ada@example.com",
  name: "Ada",
  role: "member",
  iat: Math.floor(now / 1000),
  exp: Math.floor(now / 1000) + 60,
  jti: "0123456789abcdef",
  ...over,
});
const reasonOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof WorkspaceTokenError, String(error));
    return error.reason;
  }
  return "accepted";
};

test("a token carries who the person is and their role, for one workspace", () => {
  const now = Date.now();
  const token = signWorkspaceToken(keys.privateKey, { ...person, now });
  const verified = verifyWorkspaceToken(keys.publicKey, token, { workspaceId: "w1abc", now });
  assert.equal(verified.sub, "acct_1");
  assert.equal(verified.email, "ada@example.com");
  assert.equal(verified.name, "Ada");
  assert.equal(verified.role, "member");
  assert.equal(verified.workspaceId, "w1abc");
  assert.equal(verified.expiresAt, Math.floor(now / 1000) * 1000 + 60_000);
  // Every token is its own: a workspace can tell it has seen one before.
  const again = signWorkspaceToken(keys.privateKey, { ...person, now });
  assert.notEqual(
    verifyWorkspaceToken(keys.publicKey, again, { workspaceId: "w1abc", now }).id,
    verified.id,
  );
});

test("it is an ordinary EdDSA JWT", () => {
  const [head] = signWorkspaceToken(keys.privateKey, person).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head ?? "", "base64url").toString()), {
    alg: "EdDSA",
    typ: "JWT",
  });
});

test("a token from another key, or with its claims changed, is refused", () => {
  const now = Date.now();
  const token = signWorkspaceToken(keys.privateKey, { ...person, now });
  const other = generateWorkspaceKeys();
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(other.publicKey, token, { workspaceId: "w1abc", now })),
    "signature",
  );
  const [head, payload, signature] = token.split(".") as [string, string, string];
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  const promoted = part({ ...claims, role: "owner" });
  assert.equal(
    reasonOf(() =>
      verifyWorkspaceToken(keys.publicKey, `${head}.${promoted}.${signature}`, {
        workspaceId: "w1abc",
        now,
      }),
    ),
    "signature",
  );
});

test("a token is only good for the workspace it names", () => {
  const now = Date.now();
  const token = signWorkspaceToken(keys.privateKey, { ...person, now });
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, token, { workspaceId: "w2xyz", now })),
    "audience",
  );
});

test("it expires, with a little room for clocks that disagree", () => {
  const now = Date.now();
  const token = signWorkspaceToken(keys.privateKey, { ...person, now });
  const check = (at: number) =>
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, token, { workspaceId: "w1abc", now: at }));
  assert.equal(check(now + 59_000), "accepted");
  assert.equal(check(now + 60_000 + 20_000), "accepted");
  assert.equal(check(now + 60_000 + 40_000), "expired");
  // Issued in the future by more than the leeway.
  assert.equal(check(now - 60_000), "expired");
});

test("a token that would last longer than fifteen minutes is refused, and never signed", () => {
  const now = Date.now();
  assert.throws(
    () => signWorkspaceToken(keys.privateKey, { ...person, ttlSeconds: MAX_TOKEN_SECONDS + 1 }),
    /between 1 and/,
  );
  assert.throws(
    () => signWorkspaceToken(keys.privateKey, { ...person, ttlSeconds: 0 }),
    /between 1 and/,
  );
  signWorkspaceToken(keys.privateKey, { ...person, ttlSeconds: MAX_TOKEN_SECONDS });
  const long = forge(keys.privateKey, claimsAt(now, { exp: Math.floor(now / 1000) + 3600 }));
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, long, { workspaceId: "w1abc", now })),
    "lifetime",
  );
});

test("only the control plane's algorithm and issuer are accepted", () => {
  const now = Date.now();
  const none = `${part({ alg: "none", typ: "JWT" })}.${part(claimsAt(now))}.`;
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, none, { workspaceId: "w1abc", now })),
    "malformed",
  );
  const hs = forge(keys.privateKey, claimsAt(now), "HS256");
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, hs, { workspaceId: "w1abc", now })),
    "malformed",
  );
  const wrongIssuer = forge(keys.privateKey, claimsAt(now, { iss: "someone-else" }));
  assert.equal(
    reasonOf(() =>
      verifyWorkspaceToken(keys.publicKey, wrongIssuer, { workspaceId: "w1abc", now }),
    ),
    "issuer",
  );
  const noRole = forge(keys.privateKey, claimsAt(now, { role: "superuser" }));
  assert.equal(
    reasonOf(() => verifyWorkspaceToken(keys.publicKey, noRole, { workspaceId: "w1abc", now })),
    "malformed",
  );
});

test("junk is refused without throwing anything but a token error", () => {
  for (const junk of [
    "",
    "a.b",
    "a.b.c.d",
    "not a token",
    `${part({})}.${part({})}.${"A".repeat(86)}`,
    "..",
    "é.é.é",
  ]) {
    assert.equal(
      reasonOf(() => verifyWorkspaceToken(keys.publicKey, junk, { workspaceId: "w1abc" })),
      "malformed",
      junk,
    );
  }
});

test("a public key has to be a base64url Ed25519 key, and says so when it is not", () => {
  parseWorkspacePublicKey(keys.publicKey);
  assert.throws(() => parseWorkspacePublicKey("nonsense"), /Ed25519/);
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64url");
  assert.throws(() => parseWorkspacePublicKey(rsa), /Ed25519/);
});
