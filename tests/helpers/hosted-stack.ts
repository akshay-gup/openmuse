import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { type AddressInfo, createServer as createProbe } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { createControlApp } from "../../apps/control/src/app.ts";
import type { ControlConfig } from "../../apps/control/src/config.ts";
import {
  type MachineState,
  ProvisionError,
  type ProvisionedWorkspace,
  type Provisioner,
  type WorkspaceSpec,
} from "../../apps/control/src/provisioner.ts";
import { loadSigningKeys } from "../../apps/control/src/signing.ts";
import { createApp } from "../../apps/server/src/app.ts";
import { createStore, type Store } from "../../apps/server/src/db.ts";

const listen = (server: ServerType) =>
  new Promise<number>((resolve) =>
    server.once("listening", () => resolve((server.address() as AddressInfo).port)),
  );
const closeServer = (server: ServerType) =>
  new Promise<void>((resolve) => {
    (server as Server).closeAllConnections?.();
    server.close(() => resolve());
  });

interface RunningWorkspace {
  server: ServerType;
  db: Store;
  dir: string;
}

/**
 * Workspaces that are real workspace servers in managed mode, each in this process on a port of
 * its own, so a client can be tried against both the control plane and the workspaces it opens.
 */
export class InProcessWorkspaces implements Provisioner {
  readonly name = "in-process";
  readonly running = new Map<string, RunningWorkspace>();
  readonly woken: string[] = [];
  /** Fail the next `create` this many times. */
  failCreates = 0;
  /** Resolves a create only when released, to look at a workspace while it is being made. */
  hold?: Promise<void>;
  /** An address nothing answers at, for the next `create`: a workspace that is not reachable. */
  unreachableUrl?: string;

  async create(spec: WorkspaceSpec): Promise<ProvisionedWorkspace> {
    if (this.hold) await this.hold;
    if (this.failCreates > 0) {
      this.failCreates--;
      throw new ProvisionError("the provider said no", "We could not start this workspace.");
    }
    if (this.unreachableUrl) return { url: this.unreachableUrl };
    const dir = await mkdtemp(join(tmpdir(), "hive-stack-workspace-"));
    const db = await createStore();
    const { app } = await createApp(db, {
      mode: "live",
      port: 0,
      host: "127.0.0.1",
      publicUrl: "http://127.0.0.1",
      dataDir: dir,
      encryptionKey: randomBytes(32).toString("base64"),
      googleRedirectUri: "http://127.0.0.1/api/google/callback",
      allowedOrigins: spec.allowedOrigins,
      managed: { workspaceId: spec.workspaceId, controlPublicKey: spec.controlPublicKey },
    });
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
    const port = await listen(server);
    this.running.set(spec.workspaceId, { server, db, dir });
    return { url: `http://127.0.0.1:${port}` };
  }
  async wake(workspaceId: string) {
    this.woken.push(workspaceId);
  }
  async state(workspaceId: string): Promise<MachineState> {
    return this.running.has(workspaceId) ? "running" : "missing";
  }
  async destroy(workspaceId: string) {
    await this.stop(workspaceId);
  }
  private async stop(workspaceId: string) {
    const one = this.running.get(workspaceId);
    if (!one) return;
    this.running.delete(workspaceId);
    await closeServer(one.server);
    await one.db.close();
    await rm(one.dir, { recursive: true, force: true });
  }
  async close() {
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)));
  }
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createProbe();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

/** A control plane on a port of its own, in sample mode, with workspaces that are real servers. */
export async function startHostedStack(over: Partial<ControlConfig> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "hive-stack-control-"));
  // Known before it listens, because invitation links and the workspaces' allowed origins are made from it.
  const port = await freePort();
  const db = await createStore();
  const provisioner = new InProcessWorkspaces();
  const invites: { to: string; link: string; workspaceName: string }[] = [];
  const config: ControlConfig = {
    mode: "sample",
    port,
    host: "127.0.0.1",
    publicUrl: `http://127.0.0.1:${port}`,
    dataDir: dir,
    allowedOrigins: ["http://localhost:8081"],
    maxWorkspacesPerAccount: 20,
    clientIpHeader: "x-client-ip",
    googleRedirectUri: "http://127.0.0.1/v1/auth/google/callback",
    ...over,
  };
  const control = createControlApp(db, config, {
    provisioner,
    keys: await loadSigningKeys(dir, {}),
    mailer: {
      async sendInvite(mail) {
        invites.push({ to: mail.to, link: mail.link, workspaceName: mail.workspaceName });
      },
    },
  });
  const server = serve({ fetch: control.app.fetch, port, hostname: "127.0.0.1" });
  await listen(server);
  return {
    url: config.publicUrl,
    control,
    provisioner,
    /** The invitations that were mailed. */
    invites,
    async close() {
      await closeServer(server);
      await provisioner.close();
      await db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
