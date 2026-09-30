/**
 * OpenCode agent layer: session runtime for channel threads.
 *
 * Owns the connection to `opencode serve` (systemd-managed, never spawned),
 * per-directory SDK clients, thread ↔ session bindings, and (Phase 2+)
 * the global event pipeline and AG-UI shim.
 */
export { type OpencodeClient, OpencodeClientPool } from "./client.ts";
export {
  buildSessionRuleset,
  defaultSessionRuleset,
  type PermissionRuleset,
  parsePermissionRules,
} from "./permissions.ts";
export {
  assertCompatibleServerVersion,
  connectionFromConfig,
  DEFAULT_OPENCODE_SERVER_URL,
  ensureOpencodeServerReachable,
  OPENCODE_SDK_MAJOR,
  type OpencodeConnection,
  opencodeAuthHeaders,
} from "./server.ts";
export {
  ensureThreadSession,
  type OpencodeSessionRef,
  rotateThreadSession,
  type SessionContext,
  sessionDirectory,
} from "./sessions.ts";
