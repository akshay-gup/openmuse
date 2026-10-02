/**
 * Thread ↔ OpenCode session bindings.
 *
 * Each channel thread maps to one OpenCode session. The binding
 * (`opencodeSessionId`) is persisted to the thread's JSON binding file
 * BEFORE the first prompt is sent, so a crash between create and prompt
 * never orphans a session the thread can't find. Sessions are verified on
 * reuse: if the server lost the session (restart with a cold store), a fresh
 * one is created and rebound.
 */
import { mkdir } from "node:fs/promises";
import type { ChannelThread } from "../../../../packages/domain/src/agent.ts";
import type { Config } from "../config.ts";
import { channelWorkspaceDir, type ThreadBindingStore } from "../engine/threads.ts";
import { AppError } from "../errors.ts";
import type { OpencodeClientPool } from "./client.ts";
import { buildSessionRuleset, type PermissionMode, type PermissionRuleset } from "./permissions.ts";

export interface OpencodeSessionRef {
  sessionId: string;
  /** Channel workspace dir: the session's cwd and directory-header scope. */
  directory: string;
}

export interface SessionContext {
  threads: ThreadBindingStore;
  clients: OpencodeClientPool;
  config: Config;
  /**
   * User-configured rules for the channel/thread (opencode-style). Phase 3
   * wires per-channel/thread storage; until then this defaults to empty
   * (pure default-ask).
   */
  userRules?: (binding: ChannelThread) => PermissionRuleset | Promise<PermissionRuleset>;
  /**
   * User-configured permission mode for the channel/thread ("ask" |
   * "auto", mirroring the TUI's auto-approve toggle). Defaults to "ask".
   */
  permissionMode?: (binding: ChannelThread) => PermissionMode | Promise<PermissionMode>;
}

/** The session's working directory: the channel's workspace dir. */
export function sessionDirectory(config: Config, channelId: string): string {
  return channelWorkspaceDir(config.dataDir, channelId);
}

async function findBinding(
  threads: ThreadBindingStore,
  owner: string,
  threadId: string,
): Promise<ChannelThread> {
  const all = await threads.scan(owner);
  const binding = all.find((b) => b.threadId === threadId);
  if (!binding) throw new AppError("Thread is not bound to a channel", 404);
  return binding;
}

/**
 * Create a new OpenCode session for the thread and persist the binding
 * before returning. Callers must persist-then-prompt: never prompt on a
 * session id that isn't in the binding file yet.
 */
export async function rotateThreadSession(
  ctx: SessionContext,
  owner: string,
  threadId: string,
): Promise<OpencodeSessionRef> {
  const binding = await findBinding(ctx.threads, owner, threadId);
  const directory = sessionDirectory(ctx.config, binding.channelId);
  await mkdir(directory, { recursive: true });
  const client = ctx.clients.forDirectory(directory);
  const userRules = (await ctx.userRules?.(binding)) ?? [];
  const mode = (await ctx.permissionMode?.(binding)) ?? "ask";
  const created = await client.session.create({
    title: binding.name,
    directory,
    permission: buildSessionRuleset(userRules, mode),
  });
  if (created.error || !created.data) {
    throw new AppError(
      `OpenCode session.create failed: ${JSON.stringify(created.error).slice(0, 300)}`,
      502,
    );
  }
  const sessionId = created.data.id;
  const updated: ChannelThread = { ...binding, opencodeSessionId: sessionId };
  await ctx.threads.write(owner, updated);
  return { sessionId, directory };
}

/**
 * Resolve the thread's OpenCode session, creating and binding one when the
 * thread has none (or the bound session is gone from the server).
 */
export async function ensureThreadSession(
  ctx: SessionContext,
  owner: string,
  threadId: string,
): Promise<OpencodeSessionRef> {
  const binding = await findBinding(ctx.threads, owner, threadId);
  const directory = sessionDirectory(ctx.config, binding.channelId);
  if (binding.opencodeSessionId) {
    const client = ctx.clients.forDirectory(directory);
    const existing = await client.session
      .get({ sessionID: binding.opencodeSessionId, directory })
      .catch(() => null);
    if (existing?.data) return { sessionId: binding.opencodeSessionId, directory };
    // Bound session is gone (server store was cold); rebind below.
  }
  return rotateThreadSession(ctx, owner, threadId);
}
