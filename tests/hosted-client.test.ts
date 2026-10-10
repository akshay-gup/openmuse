import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ControlApi, ControlError } from "../apps/mobile/src/hosted/control-api.ts";
import { inviteTokenFrom, inviteTokenFromPath } from "../apps/mobile/src/hosted/invite-link.ts";
import {
  openWorkspace,
  renewSession,
  shouldRenew,
  WorkspaceUnavailable,
} from "../apps/mobile/src/hosted/open-workspace.ts";
import { startHostedStack } from "./helpers/hosted-stack.ts";

let stack: Awaited<ReturnType<typeof startHostedStack>>;
before(async () => {
  stack = await startHostedStack();
});
after(async () => {
  await stack.close();
});

/** Someone's copy of the app: its own address as far as the control plane can tell, signed in as `email`. */
async function person(email: string, name?: string) {
  const api = new ControlApi(stack.url, "", (input, init) =>
    fetch(input, { ...init, headers: { ...init?.headers, "X-Client-Ip": email } }),
  );
  await api.signInByEmail(email, name);
  return api;
}
async function readyWorkspace(owner: ControlApi, name = "Acme") {
  const made = await owner.createWorkspace(name);
  assert.equal(made.status, "provisioning");
  const settled = await owner.untilSettled(made.id, { intervalMs: 20 });
  assert.equal(settled?.status, "ready");
  return settled?.id as string;
}

test("someone signs in, makes a workspace, waits for it, and is signed in to it", async () => {
  const ada = new ControlApi(stack.url);
  const account = await ada.signInByEmail("ada@example.com", "Ada Lovelace");
  assert.equal(account.email, "ada@example.com");
  assert.deepEqual((await ada.me()).workspaces, []);

  const updates: string[] = [];
  const made = await ada.createWorkspace("Acme");
  const settled = await ada.untilSettled(made.id, {
    intervalMs: 20,
    onUpdate: (w) => updates.push(w.status),
  });
  assert.equal(settled?.status, "ready");
  assert.equal(updates.at(-1), "ready");
  assert.deepEqual(
    (await ada.me()).workspaces.map((w) => [w.name, w.role, w.status]),
    [["Acme", "owner", "ready"]],
  );

  const steps: string[] = [];
  const opened = await openWorkspace(ada, made.id, { onStep: (step) => steps.push(step) });
  assert.deepEqual(steps, ["waking", "signing-in"]);
  assert.deepEqual(stack.provisioner.woken.includes(made.id), true);
  assert.equal(opened.workspace.name, "Acme");
  assert.equal(opened.user.role, "owner");
  assert.equal(opened.user.email, "ada@example.com");
  assert.ok(opened.url.startsWith("http://127.0.0.1:"));
  // The session is the workspace's own: it opens the workspace's API and the control plane's does not.
  const inside = await fetch(`${opened.url}/api/auth/session`, {
    headers: { Authorization: `Bearer ${opened.token}` },
  });
  assert.equal(inside.status, 200);
  const outside = await fetch(`${stack.url}/v1/me`, {
    headers: { Authorization: `Bearer ${opened.token}` },
  });
  assert.equal(outside.status, 401);
  // It says when it ends, about an hour on, and is not yet due for renewing.
  assert.ok(Math.abs(opened.expiresAt - (Date.now() + 60 * 60 * 1000)) < 10_000);
  assert.equal(shouldRenew(opened), false);
  assert.equal(shouldRenew({ expiresAt: Date.now() + 4 * 60 * 1000 }), true);
});

test("a session is renewed without waking the workspace, and the old one keeps working until it ends", async () => {
  const ada = await person("renew@example.com");
  const id = await readyWorkspace(ada);
  const first = await openWorkspace(ada, id);
  const wakes = stack.provisioner.woken.filter((w) => w === id).length;
  const second = await renewSession(ada, first);
  assert.notEqual(second.token, first.token);
  assert.equal(stack.provisioner.woken.filter((w) => w === id).length, wakes);
  for (const opened of [first, second]) {
    const response = await fetch(`${opened.url}/api/auth/session`, {
      headers: { Authorization: `Bearer ${opened.token}` },
    });
    assert.equal(response.status, 200);
  }
});

test("an invitation link brings someone in, as a member, and they can be removed", async () => {
  const owner = await person("owner@example.com", "Olive Owner");
  const id = await readyWorkspace(owner, "Team");
  const { link } = await owner.createInvite(id);
  const token = inviteTokenFrom(link);
  assert.ok(token);

  // Before anyone signs in, a link says what it is for.
  const stranger = new ControlApi(stack.url);
  assert.deepEqual(await stranger.previewInvite(token), {
    workspaceName: "Team",
    inviterName: "Olive Owner",
    role: "member",
  });

  const guest = await person("guest@example.com", "Gus Guest");
  const joined = await guest.acceptInvite(token);
  assert.equal(joined.id, id);
  assert.equal(joined.role, "member");
  const opened = await openWorkspace(guest, id);
  assert.equal(opened.user.role, "member");

  assert.deepEqual(
    (await owner.members(id)).map((m) => [m.name, m.role]),
    [
      ["Olive Owner", "owner"],
      ["Gus Guest", "member"],
    ],
  );
  const guestId = (await owner.members(id)).find((m) => m.role === "member")?.accountId as string;
  await owner.setRole(id, guestId, "admin");
  assert.equal((await owner.members(id)).find((m) => m.accountId === guestId)?.role, "admin");

  // Removed, they are not let back in: the control plane will not vouch for them again.
  await owner.removeMember(id, guestId);
  await assert.rejects(openWorkspace(guest, id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceUnavailable);
    assert.equal(error.reason, "gone");
    assert.match(error.message, /no longer have access/);
    return true;
  });
});

test("an invitation for one address is mailed to it, and refuses anyone else", async () => {
  const owner = await person("mailer@example.com");
  const id = await readyWorkspace(owner, "Mailed");
  const { link, invite } = await owner.createInvite(id, { email: "friend@example.com" });
  assert.equal(invite.email, "friend@example.com");
  assert.deepEqual(
    stack.invites.filter((mail) => mail.to === "friend@example.com").map((mail) => mail.link),
    [link],
  );
  const token = inviteTokenFrom(link) as string;
  const other = await person("other@example.com");
  await assert.rejects(other.acceptInvite(token), (error: unknown) => {
    assert.ok(error instanceof ControlError);
    assert.equal(error.status, 403);
    assert.match(error.message, /friend@example\.com/);
    return true;
  });
  const friend = await person("friend@example.com");
  assert.equal((await friend.acceptInvite(token)).name, "Mailed");
  assert.equal((await owner.invites(id)).length, 0);
});

test("a workspace that is still being made, or failed, or cannot be reached, says so", async () => {
  const owner = await person("trouble@example.com");

  // Still being made.
  let release!: () => void;
  stack.provisioner.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = await owner.createWorkspace("Slow");
  await assert.rejects(openWorkspace(owner, slow.id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceUnavailable);
    assert.equal(error.reason, "not-ready");
    return true;
  });
  stack.provisioner.hold = undefined;
  release();
  assert.equal((await owner.untilSettled(slow.id, { intervalMs: 20 }))?.status, "ready");

  // Failed, with the reason the person is told, and tried again.
  stack.provisioner.failCreates = 1;
  const broken = await owner.createWorkspace("Broken");
  const failed = await owner.untilSettled(broken.id, { intervalMs: 20 });
  assert.equal(failed?.status, "failed");
  await assert.rejects(openWorkspace(owner, broken.id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceUnavailable);
    assert.equal(error.reason, "failed");
    assert.match(error.message, /We could not start this workspace/);
    return true;
  });
  await owner.retry(broken.id);
  assert.equal((await owner.untilSettled(broken.id, { intervalMs: 20 }))?.status, "ready");

  // Made, but nothing answers where it is.
  const gone = await owner.createWorkspace("Gone");
  stack.provisioner.unreachableUrl = "http://127.0.0.1:9";
  const unreachable = await owner.createWorkspace("Unreachable");
  await owner.untilSettled(gone.id, { intervalMs: 20 });
  await owner.untilSettled(unreachable.id, { intervalMs: 20 });
  stack.provisioner.unreachableUrl = undefined;
  await assert.rejects(openWorkspace(owner, unreachable.id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceUnavailable);
    assert.equal(error.reason, "unreachable");
    return true;
  });
});

test("a refused session tells the app to ask the person to sign in again", async () => {
  const api = new ControlApi(stack.url, "not-a-session");
  let signedOut = 0;
  api.onSignedOut = () => signedOut++;
  await assert.rejects(api.me(), (error: unknown) => {
    assert.ok(error instanceof ControlError);
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(signedOut, 1);
  // Someone who was never signed in is just told so.
  const anonymous = new ControlApi(stack.url);
  anonymous.onSignedOut = () => signedOut++;
  await assert.rejects(anonymous.me(), /Sign in/);
  assert.equal(signedOut, 1);
});

test("signing out ends the session, and a control plane that cannot be reached is a message", async () => {
  const api = await person("leaving@example.com");
  const token = api.token;
  await api.signOut();
  assert.equal(api.token, "");
  const reused = new ControlApi(stack.url, token);
  await assert.rejects(reused.me(), (error: unknown) => (error as ControlError).status === 401);

  const nowhere = new ControlApi("http://127.0.0.1:9");
  await assert.rejects(nowhere.me(), (error: unknown) => {
    assert.ok(error instanceof ControlError);
    assert.equal(error.status, 0);
    assert.match(error.message, /Could not reach Hive/);
    return true;
  });
});

test("a workspace is deleted by its owner, and is gone for everyone", async () => {
  const owner = await person("deleter@example.com");
  const id = await readyWorkspace(owner, "Doomed");
  await owner.deleteWorkspace(id);
  assert.deepEqual(
    (await owner.me()).workspaces.filter((w) => w.id === id),
    [],
  );
  assert.equal(stack.provisioner.running.has(id), false);
  await assert.rejects(openWorkspace(owner, id), (error: unknown) => {
    assert.ok(error instanceof WorkspaceUnavailable);
    assert.equal(error.reason, "gone");
    return true;
  });
});

test("links to join a workspace are read from what was pasted, tapped or opened", () => {
  const token = "Zk3q9XvB2mPaLr7tYc4dNw8s_-AbCdEf";
  for (const text of [
    `https://hive.example.com/join/${token}`,
    `  https://hive.example.com/join/${token}/ `,
    `http://localhost:8800/join/${token}?utm=x#top`,
    `hive://join/${token}`,
    token,
  ])
    assert.equal(inviteTokenFrom(text), token, text);
  for (const text of [
    "",
    "   ",
    null,
    undefined,
    "https://hive.example.com/",
    "https://hive.example.com/join/",
    "https://hive.example.com/join/short",
    "https://hive.example.com/other/Zk3q9XvB2mPaLr7tYc4dNw8s_-AbCdEf",
    "javascript:alert(1)//join/Zk3q9XvB2mPaLr7tYc4dNw8s_-AbCdEf",
    "hello world, please let me in",
  ])
    assert.equal(inviteTokenFrom(text), null, String(text));
  assert.equal(inviteTokenFromPath(`/join/${token}`), token);
  assert.equal(inviteTokenFromPath(`/join/${token}/`), token);
  assert.equal(inviteTokenFromPath("/"), null);
  assert.equal(inviteTokenFromPath("/join/x"), null);
  assert.equal(inviteTokenFromPath(`/elsewhere/${token}`), null);
});
