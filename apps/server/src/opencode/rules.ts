/**
 * Per-channel/thread permission rules, persisted on local disk.
 *
 * Layout: `DATA_DIR/channels/<safeChannelId>/permissions.json`
 *   { "rules": ["bash:git status:allow", ...],
 *     "threads": { "<threadId>": { "rules": [...] } } }
 *
 * Rules are stored as opencode-style strings (`tool:pattern:action`,
 * parsed by `parsePermissionRules`); the effective ruleset for a thread is
 * the channel rules followed by that thread's overrides, so thread rules
 * win via findLast. On session create the merged set is appended after the
 * default-ask base (see `buildSessionRuleset`).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelThread } from "../../../../packages/domain/src/agent.ts";
import { safeChannelDirName } from "../engine/threads.ts";
import { invalidRuleLines, type PermissionRuleset, parsePermissionRules } from "./permissions.ts";

interface ChannelPermissionFile {
  rules: string[];
  threads: Record<string, { rules: string[] }>;
}

const EMPTY: ChannelPermissionFile = { rules: [], threads: {} };

function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
}

export class PermissionRulesStore {
  constructor(private readonly baseDir: string) {}

  private path(channelId: string): string {
    return join(this.baseDir, "channels", safeChannelDirName(channelId), "permissions.json");
  }

  private async read(channelId: string): Promise<ChannelPermissionFile> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.path(channelId), "utf8"));
    } catch {
      return { ...EMPTY, threads: {} };
    }
    if (!raw || typeof raw !== "object") return { ...EMPTY, threads: {} };
    const file = raw as Partial<ChannelPermissionFile>;
    const threads: Record<string, { rules: string[] }> = {};
    if (file.threads && typeof file.threads === "object") {
      for (const [threadId, entry] of Object.entries(file.threads)) {
        if (entry && typeof entry === "object")
          threads[threadId] = { rules: normalize((entry as { rules?: unknown }).rules) };
      }
    }
    return { rules: normalize(file.rules), threads };
  }

  private async write(channelId: string, file: ChannelPermissionFile): Promise<void> {
    const path = this.path(channelId);
    await mkdir(join(this.baseDir, "channels", safeChannelDirName(channelId)), { recursive: true });
    await writeFile(path, JSON.stringify(file, null, 2));
  }

  /** Channel-level rule strings (may be empty). */
  async channelRules(channelId: string): Promise<string[]> {
    return (await this.read(channelId)).rules;
  }

  /** A single thread's override rule strings (may be empty). */
  async threadRules(channelId: string, threadId: string): Promise<string[]> {
    return (await this.read(channelId)).threads[threadId]?.rules ?? [];
  }

  /**
   * Replace the channel-level rules. Every non-empty line must parse to a
   * rule; throws listing the offending lines.
   */
  async setChannelRules(channelId: string, rules: string[]): Promise<string[]> {
    const bad = invalidRuleLines(rules);
    if (bad.length > 0) throw new Error(`Invalid permission rules: ${bad.join("; ")}`);
    const file = await this.read(channelId);
    file.rules = normalize(rules);
    await this.write(channelId, file);
    return file.rules;
  }

  /** Replace one thread's override rules (same validation). */
  async setThreadRules(channelId: string, threadId: string, rules: string[]): Promise<string[]> {
    const bad = invalidRuleLines(rules);
    if (bad.length > 0) throw new Error(`Invalid permission rules: ${bad.join("; ")}`);
    const file = await this.read(channelId);
    file.threads[threadId] = { rules: normalize(rules) };
    await this.write(channelId, file);
    return file.threads[threadId].rules;
  }

  /**
   * Effective ruleset for a thread binding: parsed channel rules first,
   * thread overrides last (findLast → thread wins). Feeds `SessionContext.userRules`.
   */
  async effectiveRules(binding: ChannelThread): Promise<PermissionRuleset> {
    const file = await this.read(binding.channelId);
    const threadRules = file.threads[binding.threadId]?.rules ?? [];
    return parsePermissionRules([...file.rules, ...threadRules]);
  }
}
