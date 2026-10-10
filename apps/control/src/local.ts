import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import {
  type MachineState,
  ProvisionError,
  type ProvisionedWorkspace,
  type Provisioner,
  type WorkspaceSpec,
} from "./provisioner.ts";

export interface LocalConfig {
  /** Where each workspace keeps its files: `<dir>/<workspaceId>/`. */
  dir: string;
  /** The command that starts one workspace server, and where to run it from. */
  command: string[];
  cwd: string;
  /** Environment for every workspace server beyond what Hive sets: OPENCODE_SERVER_URL, MODEL, keys, … */
  env: Record<string, string>;
  host: string;
  waitSeconds: number;
}

type Env = Record<string, string | undefined>;

export function localConfigFromEnv(env: Env = process.env): LocalConfig {
  let extra: Record<string, string> = {};
  if (env.LOCAL_WORKSPACE_ENV?.trim()) {
    try {
      const parsed = JSON.parse(env.LOCAL_WORKSPACE_ENV);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      extra = parsed;
    } catch {
      throw new Error("LOCAL_WORKSPACE_ENV must be a JSON object of strings");
    }
  }
  return {
    dir: env.LOCAL_DIR?.trim() || ".hive-control/workspaces",
    command: (
      env.LOCAL_COMMAND?.trim() || `${process.execPath} --import tsx apps/server/src/index.ts`
    )
      .split(/\s+/)
      .filter(Boolean),
    cwd: env.LOCAL_CWD?.trim() || process.cwd(),
    env: extra,
    host: "127.0.0.1",
    waitSeconds: Number(env.LOCAL_WAIT_SECONDS ?? 60),
  };
}

/** What a workspace server may take from the control plane's environment: how to find node and reach the network, nothing else. */
const INHERITED = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
];

interface Remembered {
  port: number;
  controlPublicKey: string;
  allowedOrigins: string[];
  encryptionKey: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/**
 * Workspaces as processes on this machine, for trying the whole hosted flow on a laptop: each is
 * a workspace server of its own with its own port and data directory. It gives them only what
 * they need of the environment, so the control plane's signing key never reaches one.
 *
 * A control plane that is killed outright leaves its workspaces running. Each one's port and
 * process id are kept beside its files, so the next control plane finds it answering and carries on.
 */
export class LocalProvisioner implements Provisioner {
  readonly name = "local";
  private readonly children = new Map<string, ChildProcess>();
  private readonly starting = new Map<string, Promise<void>>();
  constructor(private readonly config: LocalConfig) {}

  private dirOf(id: string) {
    return join(this.config.dir, id);
  }
  private urlOf(port: number) {
    return `http://${this.config.host}:${port}`;
  }

  async create(spec: WorkspaceSpec): Promise<ProvisionedWorkspace> {
    await mkdir(this.dirOf(spec.workspaceId), { recursive: true, mode: 0o700 });
    let remembered = await this.recall(spec.workspaceId);
    if (!remembered) {
      remembered = {
        port: await freePort(this.config.host),
        controlPublicKey: spec.controlPublicKey,
        allowedOrigins: spec.allowedOrigins,
        encryptionKey: randomBytes(32).toString("base64"),
      };
      await writeFile(
        join(this.dirOf(spec.workspaceId), "workspace.json"),
        JSON.stringify(remembered),
        {
          mode: 0o600,
        },
      );
    }
    await this.ensureRunning(spec.workspaceId, remembered);
    return { url: this.urlOf(remembered.port) };
  }

  async wake(workspaceId: string): Promise<void> {
    const remembered = await this.recall(workspaceId);
    if (!remembered) throw new ProvisionError(`No local workspace ${workspaceId}`);
    await this.ensureRunning(workspaceId, remembered);
  }

  async state(workspaceId: string): Promise<MachineState> {
    const remembered = await this.recall(workspaceId);
    if (!remembered) return "missing";
    if (await this.answers(remembered.port, workspaceId)) return "running";
    return this.alive(workspaceId) ? "starting" : "stopped";
  }

  /** Stop the process but keep the workspace's files, as Fly stops an idle machine. */
  async stop(workspaceId: string): Promise<void> {
    const child = this.children.get(workspaceId);
    this.children.delete(workspaceId);
    if (child) return this.terminate(child);
    // Not one this control plane started: an earlier one's, still answering on the port it was given.
    const remembered = await this.recall(workspaceId);
    if (!remembered || !(await this.answers(remembered.port, workspaceId))) return;
    const pid = Number(await readFile(join(this.dirOf(workspaceId), "pid"), "utf8").catch(() => 0));
    if (!(pid > 1)) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
    for (let waited = 0; waited < 5000; waited += 100) {
      if (!(await this.answers(remembered.port, workspaceId))) return;
      await sleep(100);
    }
  }

  async destroy(workspaceId: string): Promise<void> {
    await this.stop(workspaceId);
    await rm(this.dirOf(workspaceId), { recursive: true, force: true });
  }

  async close(): Promise<void> {
    await Promise.all([...this.children.keys()].map((id) => this.stop(id)));
  }

  private alive(id: string) {
    const child = this.children.get(id);
    return Boolean(child && child.exitCode === null && child.signalCode === null);
  }

  private async recall(id: string): Promise<Remembered | null> {
    try {
      return JSON.parse(await readFile(join(this.dirOf(id), "workspace.json"), "utf8"));
    } catch {
      return null;
    }
  }

  private async terminate(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const impatient = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(impatient);
  }

  /** Callers that arrive while a workspace is coming up share the one start. */
  private ensureRunning(id: string, remembered: Remembered): Promise<void> {
    let pending = this.starting.get(id);
    if (!pending) {
      pending = this.bringUp(id, remembered).finally(() => this.starting.delete(id));
      this.starting.set(id, pending);
    }
    return pending;
  }

  private async bringUp(id: string, remembered: Remembered) {
    if (!this.alive(id) && !(await this.answers(remembered.port, id))) this.start(id, remembered);
    const until = Date.now() + this.config.waitSeconds * 1000;
    while (Date.now() < until) {
      if (await this.answers(remembered.port, id)) return;
      if (!this.alive(id))
        throw new ProvisionError(
          `The workspace server for ${id} stopped; see ${join(this.dirOf(id), "server.log")}`,
        );
      await sleep(200);
    }
    throw new ProvisionError(
      `The workspace server for ${id} did not answer in ${this.config.waitSeconds}s`,
      "The workspace started but is not answering yet. Try again in a minute.",
    );
  }

  private start(id: string, remembered: Remembered) {
    const env: Record<string, string> = {};
    for (const name of INHERITED) if (process.env[name]) env[name] = process.env[name] as string;
    Object.assign(env, this.config.env, {
      WORKSPACE_MODE: "live",
      WORKSPACE_ID: id,
      CONTROL_PLANE_PUBLIC_KEY: remembered.controlPublicKey,
      PUBLIC_API_URL: this.urlOf(remembered.port),
      ALLOWED_ORIGINS: remembered.allowedOrigins.join(","),
      TOKEN_ENCRYPTION_KEY: remembered.encryptionKey,
      HOST: this.config.host,
      PORT: String(remembered.port),
      DATA_DIR: join(this.dirOf(id), "data"),
    });
    const log = openSync(join(this.dirOf(id), "server.log"), "a");
    const [command, ...args] = this.config.command;
    const child = spawn(command as string, args, {
      cwd: this.config.cwd,
      env,
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    child.on("error", (error) => console.error(`[Hive control] ${id}: ${error.message}`));
    if (child.pid) writeFileSync(join(this.dirOf(id), "pid"), String(child.pid));
    this.children.set(id, child);
  }

  private async answers(port: number, id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.urlOf(port)}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return false;
      const health = (await response.json()) as { ok?: boolean; workspace?: string };
      return Boolean(health.ok) && health.workspace === id;
    } catch {
      return false;
    }
  }
}
