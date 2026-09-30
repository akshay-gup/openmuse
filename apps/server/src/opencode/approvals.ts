/**
 * Pending permission request tracking and replies.
 *
 * `permission.asked` events arrive on the global event bus; the AG-UI shim
 * records them here (and forwards a CUSTOM event to the client). Replies go
 * back through the SDK (`session.permission.reply`) serialized on the
 * scope's action queue so a reply never races prompt dispatch.
 *
 * Scopes are thread ids for interactive chat and `task:<taskId>` for
 * background task-worker sessions. On run abort / thread dispose, all
 * pending requests for the scope are rejected — OpenCode hangs otherwise.
 */
import type { OpencodeClientPool } from "./client.ts";
import type { OpencodeEventBus } from "./events.ts";

export type PermissionReply = "once" | "always" | "reject";

export interface PendingPermissionRequest {
  requestId: string;
  sessionId: string;
  /** Thread id, or `task:<taskId>` for background task sessions. */
  scope: string;
  threadId?: string;
  taskId?: string;
  channelId: string;
  /** Channel workspace dir — the session's cwd, captured at ask time so a
   * reply never needs to re-resolve the thread binding. */
  directory: string;
  permission: string;
  patterns: string[];
  tool?: { messageID: string; callID: string };
  askedAt: number;
}

export interface AskedPermissionProps {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  tool?: { messageID: string; callID: string };
}

export interface TrackerReplyDeps {
  bus: OpencodeEventBus;
  pool: OpencodeClientPool;
}

export class PermissionTracker {
  private readonly pending = new Map<string, PendingPermissionRequest>();

  /** Record a `permission.asked` event. Idempotent on request id. */
  record(
    scope: {
      scope: string;
      threadId?: string;
      taskId?: string;
      channelId: string;
      directory: string;
    },
    props: AskedPermissionProps,
  ): PendingPermissionRequest {
    const existing = this.pending.get(props.id);
    if (existing) return existing;
    const request: PendingPermissionRequest = {
      requestId: props.id,
      sessionId: props.sessionID,
      scope: scope.scope,
      threadId: scope.threadId,
      taskId: scope.taskId,
      channelId: scope.channelId,
      directory: scope.directory,
      permission: props.permission,
      patterns: props.patterns ?? [],
      tool: props.tool,
      askedAt: Date.now(),
    };
    this.pending.set(props.id, request);
    return request;
  }

  get(requestId: string): PendingPermissionRequest | undefined {
    return this.pending.get(requestId);
  }

  pendingForScope(scope: string): PendingPermissionRequest[] {
    return [...this.pending.values()]
      .filter((request) => request.scope === scope)
      .sort((a, b) => a.askedAt - b.askedAt);
  }

  pendingForThread(threadId: string): PendingPermissionRequest[] {
    return this.pendingForScope(threadId);
  }

  remove(requestId: string): boolean {
    return this.pending.delete(requestId);
  }

  /**
   * Reply to a pending request (`once` / `always` / `reject`), serialized
   * with the scope's other actions. The request leaves the pending set
   * once the server accepts the reply.
   */
  async reply(
    deps: TrackerReplyDeps,
    requestId: string,
    reply: PermissionReply,
  ): Promise<PendingPermissionRequest> {
    const request = this.pending.get(requestId);
    if (!request) throw new Error(`Permission request ${requestId} is not pending`);
    await deps.bus.enqueue(request.scope, () =>
      deps.pool
        .forDirectory(request.directory)
        .permission.reply({ requestID: requestId, directory: request.directory, reply })
        .then((result: { error?: unknown }) => {
          if (result.error)
            throw new Error(
              `permission.reply failed: ${JSON.stringify(result.error).slice(0, 200)}`,
            );
        }),
    );
    this.pending.delete(requestId);
    return request;
  }

  /**
   * Reject every pending request for a scope, best-effort. Called on run
   * abort and thread dispose: a permission left hanging stalls the session
   * forever. Returns the number of requests rejected.
   */
  async rejectAllForScope(deps: TrackerReplyDeps, scope: string): Promise<number> {
    const requests = this.pendingForScope(scope);
    let rejected = 0;
    for (const request of requests) {
      try {
        await deps.bus.enqueue(request.scope, () =>
          deps.pool
            .forDirectory(request.directory)
            .permission.reply({
              requestID: request.requestId,
              directory: request.directory,
              reply: "reject",
            })
            .catch(() => undefined),
        );
        rejected++;
      } catch {
        // Best effort: the session may already be gone.
      } finally {
        this.pending.delete(request.requestId);
      }
    }
    return rejected;
  }
}
