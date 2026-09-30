import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelThread } from "../../../../packages/domain/src/agent.ts";

/**
 * A channel's working directory on the API server's local disk, under DATA_DIR.
 * All channel workers share the box; each channel treats its own directory as
 * home. These directories are the future OpenCode session working directories.
 */
export function channelWorkspaceDir(baseDir: string, channelId: string): string {
  const safe = channelId.replace(/[^a-z0-9-]/g, "-").slice(0, 80) || "channel";
  return join(baseDir, "channels", safe);
}

const threadsDir = (baseDir: string, channelId: string) =>
  join(channelWorkspaceDir(baseDir, channelId), "threads");
const bindingPath = (baseDir: string, channelId: string, threadId: string) =>
  join(threadsDir(baseDir, channelId), `${threadId}.json`);

/**
 * Thread ↔ channel bindings, stored as one JSON file per thread inside the
 * channel's workspace directory (OpenCode-style), not in the records table.
 * Bindings are append-only and never rebound.
 */
export interface ThreadBindingStore {
  write(owner: string, binding: ChannelThread): Promise<void>;
  list(owner: string, channelId: string): Promise<ChannelThread[]>;
  /** Every binding across channels; used for thread → channel reverse lookup. */
  scan(owner: string): Promise<ChannelThread[]>;
}

/** Production implementation: bindings live on the API server's local disk. */
export class LocalDiskThreadStore implements ThreadBindingStore {
  constructor(private readonly baseDir: string) {}

  async write(_owner: string, binding: ChannelThread): Promise<void> {
    const dir = threadsDir(this.baseDir, binding.channelId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      bindingPath(this.baseDir, binding.channelId, binding.threadId),
      JSON.stringify(binding),
    );
  }

  async list(_owner: string, channelId: string): Promise<ChannelThread[]> {
    const dir = threadsDir(this.baseDir, channelId);
    let names: string[];
    try {
      names = (await readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const name of names) {
      try {
        const binding = JSON.parse(await readFile(join(dir, name), "utf8")) as ChannelThread;
        if (binding.threadId && binding.channelId === channelId) out.push(binding);
      } catch {
        /* skip unreadable bindings */
      }
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async scan(_owner: string): Promise<ChannelThread[]> {
    const channelsRoot = join(this.baseDir, "channels");
    let channelDirs: string[];
    try {
      channelDirs = (await readdir(channelsRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const dirName of channelDirs) {
      // The directory name is the sanitized channel id; bindings carry the true id.
      for (const binding of await this.listByDir(dirName)) out.push(binding);
    }
    return out;
  }

  private async listByDir(dirName: string): Promise<ChannelThread[]> {
    const dir = join(this.baseDir, "channels", dirName, "threads");
    let names: string[];
    try {
      names = (await readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const name of names) {
      try {
        const binding = JSON.parse(await readFile(join(dir, name), "utf8")) as ChannelThread;
        if (binding.threadId && binding.channelId) out.push(binding);
      } catch {
        /* skip unreadable bindings */
      }
    }
    return out;
  }
}

/** In-memory implementation for tests. */
export class MemoryThreadStore implements ThreadBindingStore {
  private readonly bindings = new Map<string, ChannelThread>();

  async write(_owner: string, binding: ChannelThread): Promise<void> {
    this.bindings.set(`${binding.channelId}/${binding.threadId}`, binding);
  }

  async list(_owner: string, channelId: string): Promise<ChannelThread[]> {
    return [...this.bindings.values()]
      .filter((b) => b.channelId === channelId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async scan(_owner: string): Promise<ChannelThread[]> {
    return [...this.bindings.values()];
  }
}
