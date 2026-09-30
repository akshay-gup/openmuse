import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORCHESTRATOR_CHANNEL_ID,
  type AgentTask,
  type Channel,
} from "../../../../packages/domain/src/agent.ts";
import type { Config } from "../config.ts";
import type { Store } from "../db.ts";
import { backgroundFailure } from "../log.ts";

const terminal = new Set(["succeeded", "failed", "cancelled"]);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function workerCommand(): { command: string; args: string[] } {
  const dist = join(repoRoot, "dist", "apps", "server", "src", "worker-entry.js");
  if (existsSync(dist)) return { command: process.execPath, args: [dist] };
  const tsx = join(repoRoot, "node_modules", ".bin", "tsx");
  const entry = join(repoRoot, "apps", "server", "src", "worker-entry.ts");
  return { command: tsx, args: [entry] };
}

const key = (owner: string, channelId: string) => `${owner}\n${channelId}`;

/**
 * Runs in the main (orchestrator) process when OPENMUSE_MANAGE_CHANNELS=true.
 * Spawns one worker-entry child per active channel with OPENMUSE_CHANNEL set,
 * and reaps workers whose channels went idle or were archived.
 */
export class ChannelManager {
  private timer?: ReturnType<typeof setInterval>;
  private stopping = false;
  private reconciling = false;
  private readonly children = new Map<string, { owner: string; channel: Channel; proc: ChildProcess }>();

  constructor(
    private readonly db: Store,
    private readonly config: Config,
  ) {}

  start() {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => {
      void this.reconcile().catch((error) => backgroundFailure("channel reconcile", error));
    }, 15000);
    void this.reconcile().catch((error) => backgroundFailure("channel reconcile", error));
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const { proc } of this.children.values()) proc.kill("SIGTERM");
    this.children.clear();
  }

  private spawn(owner: string, channel: Channel) {
    const k = key(owner, channel.id);
    if (this.children.has(k)) return;
    const { command, args } = workerCommand();
    const proc = spawn(command, args, {
      env: {
        ...process.env,
        OPENMUSE_CHANNEL: channel.id,
        // The child is a leaf worker: it must never manage channels itself.
        OPENMUSE_MANAGE_CHANNELS: "",
      },
      stdio: "ignore",
    });
    proc.on("exit", () => {
      if (this.children.get(k)?.proc === proc) this.children.delete(k);
    });
    this.children.set(k, { owner, channel, proc });
    void this.db
      .put(owner, "channels", {
        ...channel,
        status: "active",
        workerPid: proc.pid ?? null,
        updatedAt: new Date().toISOString(),
      })
      .catch((error) => backgroundFailure("channel workerPid update", error));
  }

  private kill(k: string, channel: Channel, owner: string, status: Channel["status"]) {
    const entry = this.children.get(k);
    entry?.proc.kill("SIGTERM");
    this.children.delete(k);
    void this.db
      .put(owner, "channels", {
        ...channel,
        status,
        workerPid: null,
        updatedAt: new Date().toISOString(),
      })
      .catch((error) => backgroundFailure("channel workerPid clear", error));
  }

  private async reconcile() {
    if (this.stopping || this.reconciling) return;
    this.reconciling = true;
    try {
      const records = await this.db.scan<Channel>("channels");
      const live = new Set<string>();
      for (const { owner, value: channel } of records) {
        if (channel.id === ORCHESTRATOR_CHANNEL_ID) continue;
        const k = key(owner, channel.id);
        if (channel.status === "archived") {
          if (this.children.has(k)) this.kill(k, channel, owner, "archived");
          continue;
        }
        live.add(k);
        if (!this.children.has(k)) this.spawn(owner, channel);
      }
      const idleMs = Math.max(1, this.config.channelWorkerIdleMinutes ?? 30) * 60 * 1000;
      for (const [k, { owner, channel }] of this.children) {
        if (!live.has(k)) continue;
        const fresh = await this.db.get<Channel>(owner, "channels", channel.id);
        if (!fresh || fresh.status === "archived") {
          this.kill(k, fresh ?? channel, owner, "archived");
          continue;
        }
        const tasks = await this.db.list<AgentTask>(owner, "tasks");
        const open = tasks.filter(
          (t) => (t.channelId ?? ORCHESTRATOR_CHANNEL_ID) === channel.id && !terminal.has(t.status),
        );
        if (open.length > 0) continue;
        const heartbeat = await this.db.get<{ lastTickAt: string }>(
          "system",
          "worker-status",
          `tasks:${channel.id}`,
        );
        const lastActive = Math.max(
          Date.parse(channel.lastActiveAt ?? channel.updatedAt),
          heartbeat ? Date.parse(heartbeat.lastTickAt) : 0,
        );
        if (Date.now() - lastActive > idleMs) this.kill(k, fresh, owner, "idle");
      }
    } finally {
      this.reconciling = false;
    }
  }
}
