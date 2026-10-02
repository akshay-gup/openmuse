/**
 * Per-channel/thread permission rules, persisted on local disk.
 *
 * Layout: `DATA_DIR/channels/<safeChannelId>/permissions.json`
 *   { "rules": ["bash:git status:allow", ...],
 *     "mode": "ask" | "auto",
 *     "threads": { "<threadId>": { "rules": [...], "mode": "ask" | "auto" | null } } }
 *
 * Rules are stored as opencode-style strings (`tool:pattern:action`,
 * parsed by `parsePermissionRules`); the effective ruleset for a thread is
 * the channel rules followed by that thread's overrides, so thread rules
 * win via findLast. On session create the merged set is appended after the
 * mode base (see `buildSessionRuleset`). A thread mode of null/absent
 * inherits the channel mode.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelThread } from "../../../../packages/domain/src/agent.ts";
import { diskOwnerForChannel, safeChannelDirName, safeOwnerDir } from "../engine/threads.ts";
import {
  invalidRuleLines,
  isPermissionMode,
  type PermissionMode,
  type PermissionRuleset,
  parsePermissionRules,
} from "./permissions.ts";

interface ThreadPermissionEntry {
  rules: string[];
  mode?: PermissionMode | null;
}

interface ChannelPermissionFile {
  rules: string[];
  mode?: PermissionMode;
  threads: Record<string, ThreadPermissionEntry>;
}

const EMPTY: ChannelPermissionFile = { rules: [], threads: {} };

function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeMode(raw: unknown): PermissionMode | undefined {
  return isPermissionMode(raw) ? raw : undefined;
}

export class PermissionRulesStore {
  constructor(private readonly baseDir: string) {}

  private path(owner: string, channelId: string): string {
    return join(
      this.baseDir,
      "owners",
      safeOwnerDir(owner),
      "channels",
      safeChannelDirName(channelId),
      "permissions.json",
    );
  }

  /** Resolve the disk owner: shared channels are global, orchestrators are per-user. */
  private diskOwner(owner: string, channelId: string): string {
    return diskOwnerForChannel(channelId, owner);
  }

  private async read(owner: string, channelId: string): Promise<ChannelPermissionFile> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.path(owner, channelId), "utf8"));
    } catch {
      return { ...EMPTY, threads: {} };
    }
    if (!raw || typeof raw !== "object") return { ...EMPTY, threads: {} };
    const file = raw as Partial<ChannelPermissionFile>;
    const threads: Record<string, ThreadPermissionEntry> = {};
    if (file.threads && typeof file.threads === "object") {
      for (const [threadId, entry] of Object.entries(file.threads)) {
        if (entry && typeof entry === "object") {
          const typed = entry as Partial<ThreadPermissionEntry>;
          threads[threadId] = {
            rules: normalize(typed.rules),
            ...(normalizeMode(typed.mode) ? { mode: normalizeMode(typed.mode) } : {}),
          };
        }
      }
    }
    const out: ChannelPermissionFile = { rules: normalize(file.rules), threads };
    const mode = normalizeMode(file.mode);
    if (mode) out.mode = mode;
    return out;
  }

  private async write(
    owner: string,
    channelId: string,
    file: ChannelPermissionFile,
  ): Promise<void> {
    const path = this.path(owner, channelId);
    await mkdir(
      join(this.baseDir, "owners", safeOwnerDir(owner), "channels", safeChannelDirName(channelId)),
      {
        recursive: true,
      },
    );
    await writeFile(path, JSON.stringify(file, null, 2));
  }

  /** Channel-level rule strings (may be empty). */
  async channelRules(owner: string, channelId: string): Promise<string[]> {
    return (await this.read(this.diskOwner(owner, channelId), channelId)).rules;
  }

  /** A single thread's override rule strings (may be empty). */
  async threadRules(owner: string, channelId: string, threadId: string): Promise<string[]> {
    return (
      (await this.read(this.diskOwner(owner, channelId), channelId)).threads[threadId]?.rules ?? []
    );
  }

  /**
   * Replace the channel-level rules. Every non-empty line must parse to a
   * rule; throws listing the offending lines.
   */
  async setChannelRules(owner: string, channelId: string, rules: string[]): Promise<string[]> {
    const bad = invalidRuleLines(rules);
    if (bad.length > 0) throw new Error(`Invalid permission rules: ${bad.join("; ")}`);
    const diskOwner = this.diskOwner(owner, channelId);
    const file = await this.read(diskOwner, channelId);
    file.rules = normalize(rules);
    await this.write(diskOwner, channelId, file);
    return file.rules;
  }

  /** Replace one thread's override rules (same validation; keeps any mode override). */
  async setThreadRules(
    owner: string,
    channelId: string,
    threadId: string,
    rules: string[],
  ): Promise<string[]> {
    const bad = invalidRuleLines(rules);
    if (bad.length > 0) throw new Error(`Invalid permission rules: ${bad.join("; ")}`);
    const diskOwner = this.diskOwner(owner, channelId);
    const file = await this.read(diskOwner, channelId);
    const prev = file.threads[threadId];
    file.threads[threadId] = {
      rules: normalize(rules),
      ...(prev?.mode ? { mode: prev.mode } : {}),
    };
    await this.write(diskOwner, channelId, file);
    return file.threads[threadId].rules;
  }

  /** Channel permission mode ("ask" when unset). */
  async channelMode(owner: string, channelId: string): Promise<PermissionMode> {
    return (await this.read(this.diskOwner(owner, channelId), channelId)).mode ?? "ask";
  }

  /** Set the channel permission mode. */
  async setChannelMode(
    owner: string,
    channelId: string,
    mode: PermissionMode,
  ): Promise<PermissionMode> {
    const diskOwner = this.diskOwner(owner, channelId);
    const file = await this.read(diskOwner, channelId);
    file.mode = mode;
    await this.write(diskOwner, channelId, file);
    return mode;
  }

  /** A thread's mode override, or null when it inherits the channel mode. */
  async threadMode(
    owner: string,
    channelId: string,
    threadId: string,
  ): Promise<PermissionMode | null> {
    return (
      (await this.read(this.diskOwner(owner, channelId), channelId)).threads[threadId]?.mode ?? null
    );
  }

  /**
   * Set a thread's mode override; null clears it back to inheriting the
   * channel mode.
   */
  async setThreadMode(
    owner: string,
    channelId: string,
    threadId: string,
    mode: PermissionMode | null,
  ): Promise<PermissionMode | null> {
    const diskOwner = this.diskOwner(owner, channelId);
    const file = await this.read(diskOwner, channelId);
    const prev = file.threads[threadId] ?? { rules: [] };
    file.threads[threadId] = {
      rules: prev.rules,
      ...(mode ? { mode } : {}),
    };
    await this.write(diskOwner, channelId, file);
    return mode;
  }

  /**
   * Effective mode for a thread binding: thread override wins, otherwise the
   * channel mode, defaulting to "ask". Feeds `SessionContext.permissionMode`.
   */
  async effectiveMode(owner: string, binding: ChannelThread): Promise<PermissionMode> {
    const file = await this.read(this.diskOwner(owner, binding.channelId), binding.channelId);
    return file.threads[binding.threadId]?.mode ?? file.mode ?? "ask";
  }

  /**
   * Effective ruleset for a thread binding: parsed channel rules first,
   * thread overrides last (findLast → thread wins). Feeds `SessionContext.userRules`.
   */
  async effectiveRules(owner: string, binding: ChannelThread): Promise<PermissionRuleset> {
    const file = await this.read(this.diskOwner(owner, binding.channelId), binding.channelId);
    const threadRules = file.threads[binding.threadId]?.rules ?? [];
    return parsePermissionRules([...file.rules, ...threadRules]);
  }
}
