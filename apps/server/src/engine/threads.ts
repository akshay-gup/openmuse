import type { ChannelThread } from "../../../../packages/domain/src/agent.ts";
import { type ComputerService, channelWorkspaceDir } from "../computer.ts";

const threadsDir = (channelId: string) => `${channelWorkspaceDir(channelId)}/threads`;
const bindingPath = (channelId: string, threadId: string) =>
  `${threadsDir(channelId)}/${threadId}.json`;

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

/** Production implementation: bindings live in the shared computer. */
export class ComputerThreadStore implements ThreadBindingStore {
  constructor(private readonly computer: ComputerService) {}

  async write(owner: string, binding: ChannelThread): Promise<void> {
    try {
      await this.computer.mkdir(owner, threadsDir(binding.channelId));
    } catch {
      /* already exists */
    }
    await this.computer.write(
      owner,
      bindingPath(binding.channelId, binding.threadId),
      JSON.stringify(binding),
    );
  }

  async list(owner: string, channelId: string): Promise<ChannelThread[]> {
    const dir = threadsDir(channelId);
    let names: string[];
    try {
      const listing = await this.computer.list(owner, dir);
      names = listing.entries
        .filter((e) => e.type === "file" && e.name.endsWith(".json"))
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const name of names) {
      try {
        const { text } = await this.computer.read(owner, `${dir}/${name}`);
        const binding = JSON.parse(text) as ChannelThread;
        if (binding.threadId && binding.channelId === channelId) out.push(binding);
      } catch {
        /* skip unreadable bindings */
      }
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async scan(owner: string): Promise<ChannelThread[]> {
    let channelDirs: string[];
    try {
      const listing = await this.computer.list(owner, "/workspace/channels");
      channelDirs = listing.entries.filter((e) => e.type === "directory").map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const name of channelDirs) {
      // The directory name is the sanitized channel id; bindings carry the true id.
      for (const binding of await this.listByDir(owner, name)) out.push(binding);
    }
    return out;
  }

  private async listByDir(owner: string, dirName: string): Promise<ChannelThread[]> {
    const dir = `/workspace/channels/${dirName}/threads`;
    let names: string[];
    try {
      const listing = await this.computer.list(owner, dir);
      names = listing.entries
        .filter((e) => e.type === "file" && e.name.endsWith(".json"))
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: ChannelThread[] = [];
    for (const name of names) {
      try {
        const { text } = await this.computer.read(owner, `${dir}/${name}`);
        const binding = JSON.parse(text) as ChannelThread;
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
